(function(){
var isIE = (navigator.appVersion.indexOf('Trident') ? true : false);
var now = (function() 
{
    if (!window.performance)
        return function() { return new Date().getTime(); };
    return (performance.now       ||
            performance.mozNow    ||
            performance.msNow     ||
            performance.oNow      ||
            performance.webkitNow).bind(window.performance);
})().bind(window);

var requestAnimationFrame = (function() {
  return window.requestAnimationFrame       ||
         window.webkitRequestAnimationFrame ||
         window.mozRequestAnimationFrame    ||
         window.oRequestAnimationFrame      ||
         window.msRequestAnimationFrame     ||
         function(callback) {
           window.setTimeout(callback, 1000 / 60);
         };
})().bind(window);
    
var config = {
    batchAppendViews: false, // TODO: settign to true breaks when scrolling up
    staticHeights: true,
    fastScrollingRate: 30,
    scrollingSampleSize: 10,
    destoryLag: 3.0,
    drawAhead: 3.0,
    drawTrigger: 1.0
},
throttleFastCheck = 0,
debug = {
    profile: false, // allow auto-on when heavy loads are hit
    fps: true // super light and informative inspection of scroll perfromance
},
_timings = [],
trackFPS = (function(t)
{
    var log = ( !isIE ? 
        function(fps, max, mean, lastY, delta)
        {
            console.log('%cfps:%c'+fps.toFixed(2)+
                '  %cmax:%c'+max.toFixed(2)+'ms'+
                '  %cavg:%c'+mean.toFixed(2)+'ms '+
                '  %cy:%c'+lastY.toFixed(0)+' '+
                delta, 
                'color: black;', 'color: red;', 
                'color: black;', 'color: red;', 
                'color: black;', 'color: red;', 
                'color: black;', 'color: red;');
        }
    :
        function(fps, max, mean, lastY, delta)
        {
            console.log('fps:'+fps.toFixed(2)+
                '  max:'+max.toFixed(2)+'ms'+
                '  avg:'+mean.toFixed(2)+'ms '+
                '  y:'+lastY.toFixed(0)+' '+
                delta);
        }
    );
    if (window.ArrayBuffer && window.Float64Array)
    {
        // NOTE: Chrome hits a max of 63 requestAnimationFrames per second
        t = new Float64Array(new ArrayBuffer(110*8)); 
    }
    else
    {
        for(var i=110; i >= 0; i--)
        {
            t.push(0);
        }
    }
    t[0] = 1;
    
    var cur = 0, sum = 0, max = 0, thousand = 1000, sixty = 60, mean, fps, last;
    return function(delta, lastY)
    {
        cur = t[0];
        t[cur] = delta;
        
        // pref: adding and popping to array causes leak until GC'd
        last = cur-1;
        sum = t[last] - t[1];
        t[0] = cur = cur + 1;
        
        if (sum < thousand) return;
        
        mean = sum / cur;
        fps = thousand / (sum / cur);
        
        max = 0;
        while (cur > 2)
        {
            last = cur-1;
            max = Math.max(t[cur] - t[last], max);
            cur = cur - 1;
        }
        t[0] = 1;
        
        log(fps, max, mean, lastY, delta);
    }
}(_timings)),

lastRun = function()
{
    return _timings[_timings[0]-1] - _timings[_timings[0]-2];
},

iscroll = null,
isIOS = (document.documentElement.style.webkitOverflowScrolling !== undefined ? true : false),
living = (function(total)
{
    return { 
        set add(value)
        {
            total += value;
            if (value === 1) requestAnimationFrame(update);
        },
        get add()
        {
            return total;
        }
    };
}(0));


var poolviews = [],
frag = document.createDocumentFragment(),
lastScrollY = 0, // TODO: move this to the pool view to allow for multiple pools

scrollTop = function($container, $content)
{
    var t;
    if ($container[0].scrollTop !== 0)
        return $container[0].scrollTop;
        
    t = $content.css('transform') || $content.css('webkitTransform') || $content.css('msTransform')
    t = (t === 'none' ?  0 :  Math.abs(Number(t.slice(t.lastIndexOf(',')+2, t.length-1))));
    
    if (t === 0)
        t = document.body.scrollTop;
        
    return Math.abs(Number(t));
},

fastScrollingOptimization = function(view, speed)
{
    var avgSpeed = 0, len, i, prop, reuseView;
    // pref: storing and shifting builds up 500k before it's GC'd
    // TODO: change from shift/push to reusing indexies in the array
    if (view._speed.length > config.scrollingSampleSize) view._speed.shift();
    
    view._speed.push(speed);
    len = view._speed.length;
    for(i=0; i < len; i++)
    {
        avgSpeed += view._speed[i];
    }
    avgSpeed = avgSpeed / len;
    
    if (!view._freezeAllocations)
    {
        if (avgSpeed < config.fastScrollingRate) return;
        
        console.log('fastscrolling: on '+avgSpeed);
        // save texture memory to prevent crashes on iOS
        view._freezeAllocations = true;
        
        for (prop in view._pool)
        {
            len = view._pool[prop].length-1;
            for (j=len; j > -1; j--)
            {
                reuseView = view._pool[prop][j];
                reuseView._freezeAllocations(true);
            }
            len = view._dequeued[prop].length-1;
            for (j=len; j > -1; j--)
            {
                reuseView = view._dequeued[prop][j];
                reuseView._freezeAllocations(true);
            }
        }
        return;
    }
    
    if (view._freezeAllocations)
    {
        if (avgSpeed > 0) return;
        
        console.log('fastscrolling: off '+avgSpeed);
        for (prop in view._pool)
        {
            len = view._pool[prop].length-1;
            for (j=len; j > -1; j--)
            {
                reuseView = view._pool[prop][j];
                reuseView._freezeAllocations(false);
            }
            len = view._dequeued[prop].length-1;
            for (j=len; j > -1; j--)
            {
                reuseView = view._dequeued[prop][j];
                reuseView._saveMemoryMode = false; // bypass rendering dequed view
            }
        }
        view._freezeAllocations = false;         
    }
},

dequeueViews = function(view, cachedY, cursor, disposeLimit, isDown)
{
    var prop, len, j, reuseView, idx, y, isDisposable;
    for (prop in view._pool) // check each reuseView type
    {
        len = view._pool[prop].length-1;
        for (j=len; j > -1; j--)
        {
            reuseView = view._pool[prop][j];
            
            // NOTE: this is not checking the bottom or top in the proper
            // place, but the disposeLimit shouldn't be close to the view.
            // This saves extra checks.
            idx = reuseView._idx;
            y = cachedY[idx];
            
            isDisposable = (isDown ? y < disposeLimit : y > disposeLimit);
            if (!isDisposable) continue;
            
            if (isDown)
                cursor[0] = Math.max(cursor[0], idx);
            else
                cursor[1] = Math.min(cursor[1], idx);
            
            view._dequeued[prop].push(reuseView);
            view._pool[prop].splice(j, 1);
            
            // unusedFrag.appendChild(reuseView.$el[0]);
            
            // console.log('dequeued ReuseItem: '+prop+' at: '+idx+' y:'+y);
        }
    }
},

skipCursorForwards = function(cursor, cachedY, disposeLimit, max, estimateFn)
{
    var estimate, shouldResetCursorEnd, _cursor;
    
    _cursor = Math.min(cachedY.length, cursor[0]);
    while( cachedY[_cursor] < disposeLimit && _cursor < max)
    {
        _cursor++;
        if (cachedY[_cursor] === undefined) cachedY[_cursor] = 0;
        
        if (cachedY[_cursor]) continue; // skip estimates if already have number
        
        estimate = estimateFn(_cursor);
        cachedY[_cursor] = cachedY[_cursor-1] + estimate;
    }
    
    shouldResetCursorEnd = cursor[0] >= cursor[1];
    if (shouldResetCursorEnd) cursor[1] = cursor[0];
    
    if (!cachedY[cursor[1]]) cachedY[cursor[1]] = 0;
},

skipCursorBackwards = function(cursor, cachedY, disposeLimit, estimateFn)
{
    var estimate, shouldResetCursorEnd, _cursor;
    
    _cursor = cursor[1];
    while( cachedY[_cursor] > disposeLimit && _cursor >= 0)
    {
        _cursor--;
        if (cachedY[_cursor] === undefined) cachedY[_cursor] = 0;
        
        if (cachedY[_cursor]) continue; // skip estimates if already have number
        
        estimate = estimateFn(_cursor);
        cachedY[_cursor] = cachedY[_cursor+1] + estimate;
    }
    
    shouldResetCursorEnd = cursor[1] <= cursor[0];
    if (shouldResetCursorEnd) cursor[0] = cursor[1];
},

appendViews = function(view, cachedY, cursor, provisionLimit, isDown, max)
{
    // can use document fragment if the reuse views have static heights.
    var reuseView,
    $items = view._$items[0],
    idx,
    next,
    shouldPaint,
    height = (config.batchAppendViews || config.staticHeights ? 
        function heightGuess(){ return view.estimateHeightAt(idx) } :
        function heightCalculate(){ return reuseView.height() });
    
    if(isDown)
    {
        idx = 1;
        next = 1;
        shouldPaint = function()
        { 
            return (cachedY[cursor[1]] < provisionLimit && cursor[1] < max); 
        }
    }
    else
    {
        idx = 0;
        next = -1;
        shouldPaint = function()
        { 
            return (cachedY[cursor[0]] > provisionLimit && cursor[0] > -1); 
        }
    }
    
    while(shouldPaint())
    {
        // console.log(cachedY[cursor[1]])
        
        reuseView = view.repaint(cursor[idx], cachedY[cursor[idx]]);
        if (!reuseView) 
            throw new Error('No ReuseView was returned from PoolView.render for idx '+cursor[1]+'.');
        
        reuseView._idx = cursor[idx];
        reuseView._top = cachedY[cursor[idx]];
        
        // move from unsed fragment to the items
        $items.appendChild(reuseView.$el[0]);
        
        cursor[idx] += next;
        
        cachedY[cursor[idx]] = (cachedY[cursor[idx]-1] + height()) || 0; // hack fix for NaN
    }

    if (cursor[idx] < 0) cursor[idx] = 0;
},

updateCursor = function($content, cachedY, max, iscroll)
{
    // update the max height
    var height = Number($content[0].style['height'].split('px')[0]),
    len = cachedY.length,
    last = len-1;
    
    if (len >= max || height < cachedY[last])
    {
        var remaining = max - len;
        
        $content[0].style['height'] =  
            cachedY[last] + (remaining * cachedY[cachedY[1]]) + 'px';
            
        if (iscroll)
        {
            iscroll.refresh();
        }
    }
};


// will get triggered just before the painting. 
var poollen,
view, $container, $items, isScrollingDown, shouldRedraw, scrollY, scrollHeight, 
reuseView, item, items, isDisposable, provisioningThreshold, cursor, range, top,
provisionLimit, disposeLimit, scrollBottom, contentHeight, prop, idx, cachedY,
lastHeight, speed, shouldResetCursorEnd, isScrollingFast, i,j,y,len, fps, last;



// This is only created once. It saves on alloc/dealloc cycles and 
// keeps it out of the GC. All depenencies are passed into the constuctor.
var update = function(delta) 
{
    // console.timeStamp('go:'+delta);
    if (delta)
    {
        trackFPS(delta, lastScrollY);
        fps = delta;
    }
    
    poollen = poolviews.length;
    
    // process for each poolview
    for (i=0; i < poollen; i++)
    {
        view = poolviews[i];
        $container = view._$container;
        $content = view._$content;
        $items = view._$items;
        cursor = view._cursor;
        cachedY = view._positionCache;
        
        // check the scroll position of the container
        
        scrollY = scrollTop($container, $content);
        isScrollingDown = lastScrollY <= scrollY;
        scrollHeight = $container.height();
        contentHeight = $content.height();
        scrollBottom = scrollY + scrollHeight;
        
        
        if (throttleFastCheck++ > 10)
        {
            speed = Math.abs(scrollY - lastScrollY);
            fastScrollingOptimization(view, speed);
            throttleFastCheck = 0;
        }
        
        lastScrollY = scrollY;
        
        // get the limit to dispose and provisioning limit
        if (!isScrollingDown)
        {
            disposeLimit = scrollBottom + (scrollHeight * config.destoryLag);
            provisionLimit = scrollY - (scrollHeight * config.drawAhead);
            provisioningThreshold = scrollBottom - (scrollHeight * config.drawTrigger);
            
            shouldRedraw = (cachedY[cursor[0]] > provisioningThreshold);
            if (!shouldRedraw) continue;
            
            last = lastRun(_timings);
            
            if (debug.profile && last > 100) console.profile('run-' + (fps || 0));
            
            if (config.batchAppendViews) frag.appendChild($content[0]);
            
            // if passes then enqueViews
            dequeueViews(view, cachedY, cursor, disposeLimit, false);
            
            // fast skip the cursor to the Y of the scroll view 
            skipCursorBackwards(cursor, 
                            cachedY, 
                            disposeLimit, 
                            view.collection.length, 
                            view.estimateHeightAt);
                            
            // render the new view
            appendViews(view, cachedY, cursor, provisionLimit, false);
            
            // validate the height/position of the container
            updateCursor($content, cachedY, view.collection.length, iscroll);
            
            if (debug.profile && last > 100) console.profileEnd('run-' + (fps || 0));
            
            if (config.batchAppendViews) $container.appendChild($content);
            
            continue; // don't process the down scrolling
        }
        
        
        
        // TODO: Wrap as much as possible in functions for easier profiling
        // TODO: Generalize functions to work either up or down
        
        
        
        // is scrolling down (normal)
        
        // redraw as few times as possible and in groups of elements
        disposeLimit = scrollY - (scrollHeight * config.destoryLag);
        provisionLimit = Math.min(scrollBottom + (scrollHeight * config.drawAhead), contentHeight);
        provisioningThreshold = scrollBottom + (scrollHeight * config.drawTrigger);
        
        shouldRedraw = (cachedY[cursor[1]] < provisioningThreshold);
        if (!shouldRedraw) continue;
        
        last = lastRun();
        
        if (debug.profile && last > 100) console.profile('run-' + (fps || 0));
        
        
        // NOTE: Had a document fragment here but it hurts performance. 
        // Removing from the DOM forces the GPU tiles to clear and 
        // redraw the texture from scratch on each update call.
        if (config.batchAppendViews) frag.appendChild($content[0]);
        
        // remove unsed items
        dequeueViews(view, cachedY, cursor, disposeLimit, true);
        
        // when dragging the scroll bar, estimate height at position instead of rendering
        skipCursorForwards(cursor, 
                        cachedY, 
                        disposeLimit, 
                        view.collection.length, 
                        view.estimateHeightAt);
        
        appendViews(view, cachedY, cursor, provisionLimit, true, view.collection.length)
        
        updateCursor($content, cachedY, view.collection.length, iscroll);
        
        
        // console.log('range: '+range+'\ncursor:'+cursor+'\ndispose:'+
        //     disposeLimit+'\nprovision:'+provisionLimit+'\nrange:'+
        //     (provisionLimit-disposeLimit)+
        //     '\npooled:'+view._pool['li'].length+
        //     '\ndequeued:'+view._dequeued['li'].length);
        
        if (config.batchAppendViews) $container[0].appendChild($content[0]);
        
        // console.log('reuseView count: '+view._pool['li'].length);
        
        if (debug.profile && last > 100) console.profileEnd('run-'+fps);
    }
    
    // done update all the pools
    if (living) requestAnimationFrame(update);
    
    
}


// This view will be the container for the reuse views. It will
// control reflow to happen inside this view. New or dirty objects
// will be stored in a pool to reuse. 
var PerfView = Backbone.PerfView = function(opts) 
{
    // call backbone constructor
    Backbone.View.prototype.constructor.apply(this, opts);
    
    this.collection = opts.collection;
    this._staticHeights = opts.staticHeights || false;
    
    // hold reference in static to watch multiple poolviews at once
    poolviews.push(this);
    
    this.render();
    
    this._$container = this.$el.find(this.$container);
    if (this._$container.length === 0) this._$container = this.$el;
    this._$container.css({'position':'realtive', 'width': '100%'});
    this._$container.css('-webkit-transform','translate3d(0,0,0)');
    
    this._$content = $('<div id="scroller">');
    this._$content.css('-webkit-transform','translate3d(0,0,0)');
    this._$content.css({'position':'absolute', 'width': '100%'});
    this.$el.append(this._$content);
    this._$content.css('height', collection.length * this.estimateHeightAt(0));
    
    this._$items = $('<div class="PoolViewItems" style="-webkit-transform: translate(0,0,0)">');
    this._$content.append(this._$items);
    
    // use iScroll to overcome pause JS execution on iOS
    if (isIOS && window.IScroll) 
        iscroll = new IScroll( this._$container[0] );
    else if (this._$container[0] === document.body)
        this._$container.css({height: '100%'});
    else
        this._$container.css({overflowY: 'scroll', overflowX:'hidden'});
    
    // register for requestAnimationFrame to sync/trigger repaints
    living.add += 1;
}

_.extend(Backbone.PerfView.prototype, {
    collection: null, // need to have the collection on creation
    
    _$container: null,
    _$content: null,
    _$items: null,
    _pool: {},
    _dequeued: {},
    _cursor: [0,0],
    _positionCache: [0], // make sure all CSS is loaded before creating the view
    _speed: [],
    _freezeAllocations: false,
    _staticHeights: false,
    
    dequeueView: function( id, reuseSubclass, opts ) 
    {
        // store in key-value store with the name and the class instance
        this._dequeued[id] = this._dequeued[id] || [];
        this._pool[id] = this._pool[id] || [];
        dequeue = this._dequeued[id].pop();
        if (dequeue) 
        {
            dequeue.model = opts.model;
            this._pool[id].push(dequeue);
            dequeue._freezeAllocations(this._freezeAllocations);
            return dequeue; // instance already in heap
        }
        
        // create new DOM/JS in heap and return
        var alloced = new reuseSubclass( _.extend({staticHieght:this._staticHeights}, opts) );
        alloced._reuseId = id;
        alloced._freezeAllocations(this._freezeAllocations);
        
        this._pool[id].push(alloced);
        return alloced;
    },
    estimateHeightAt: function(idx){
        // override
    },
    remove: function() {
        // remove count from animation frame
        // backbone super remove
    }
});

_.extend(Backbone.PerfView.prototype, Backbone.View.prototype);
Backbone.PerfView.extend = Backbone.View.extend;


}())

