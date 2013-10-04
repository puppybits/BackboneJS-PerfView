(function(){

var fastScrollingRate = 50,
scrollingSampleSize = 10,
throttleFastCheck = 0,
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
scrollTop = function($container, $content)
{
    var t;
    if ($container[0].scrollTop !== 0)
        return $container[0].scrollTop;
        
    t = $content.css('webkitTransform') || $content.css('msTransform')
    t = t.slice(t.lastIndexOf(',')+2, t.length-1);
    t = Math.abs(Number(t));
    if (t === 0)
        t = document.body.scrollTop;
        
    return Math.abs(Number(t));
},
fastScrollingOptimization = function(view, speed)
{
    var avgSpeed = 0, len, i, prop, reuseView;
    if (view._speed.length > scrollingSampleSize) view._speed.shift();
    
    view._speed.push(speed);
    len = view._speed.length;
    for(i=0; i < len; i++)
    {
        avgSpeed += view._speed[i];
    }
    avgSpeed = avgSpeed / len;
    
    if (!view._isScrollingFast)
    {
        if (avgSpeed < fastScrollingRate) return;
        
        console.log('fastscrolling: on '+avgSpeed);
        // save texture memory to prevent crashes on iOS
        view._isScrollingFast = true;
        
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
                reuseView._freezeAllocations(false);
            }
        }
        return;
    }
    
    if (view._isScrollingFast)
    {
        if (avgSpeed > 0) return;
        
        console.log('fastscrolling: off '+avgSpeed);
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
                reuseView._saveMemoryMode = true;
            }
        }
        view._isScrollingFast = false;         
    }
},
frag = document.createDocumentFragment(),
unusedFrag = document.createDocumentFragment(),
lastScrollY = 0;



// This is only created once. It saves on alloc/dealloc cycles and 
// keeps it out of the GC. All depenencies are passed into the constuctor.
var update = function() 
{
    //console.log( $($('.listElmnt')[0]).height() );
    
    // will get triggered just before the painting. 
    var poollen = poolviews.length, 
    view, $container, $items, isScrollingDown, shouldRedraw, scrollY, scrollHeight, 
    reuseView, item, items, isDisposable, provisioningThreshold, cursor, range, top,
    provisionLimit, disposeLimit, scrollBottom, contentHeight, prop, idx, cachedY,
    lastHeight, speed, shouldResetCursorEnd, isScrollingFast, i,j,y,len;
    
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
            continue; // don't process the down scrolling
        }
        
        // is scrolling down (normal)
        
        // redraw as few times as possible and in groups of elements
        disposeLimit = scrollY - (scrollHeight * 0.5);
        provisionLimit = Math.min(scrollBottom + (scrollHeight * 1.25), contentHeight);
        provisioningThreshold = Math.min(scrollBottom + (scrollHeight * 0.5), contentHeight);
        
        shouldRedraw = (cachedY[cursor[1]] < provisioningThreshold);
        if (!shouldRedraw) continue;
        
        // NOTE: Had a document fragment here but it hurts performance. 
        // Removing from the DOM forces the GPU tiles to clear and 
        // redraw the texture from scratch on each update call.
        
        // remove unsed items
        for (prop in view._pool)
        {
            len = view._pool[prop].length-1;
            for (j=len; j > -1; j--)
            {
                reuseView = view._pool[prop][j];
            
                // get bottom position of item
                idx = reuseView._idx;
                y = cachedY[idx + 1];
                
                // if position in the disposeLimit move to the pool
                isDisposable = y < disposeLimit;
                if (!isDisposable) continue;
                
                cursor[0] = Math.max(cursor[0], idx + 1);
                
                view._dequeued[prop].push( reuseView );
                view._pool[prop].splice(j,1);
                
                // unusedFrag.appendChild(reuseView.$el[0]);
                
                // console.log('dequeued ReuseItem: '+prop+' at: '+idx+' y:'+y);
            }
        }
        
        // when dragging the scroll bar, estimate height at position
        cursor[0] = Math.min(cachedY.length, cursor[0]);
        while( cachedY[cursor[0]] < disposeLimit && cursor[0] < view.collection.length)
        {
            cursor[0]++;
            if (cachedY[cursor[0]] === undefined) cachedY.push(0);
            
            if (cachedY[cursor[0]]) continue;
            
            var estimate = view.estimateHeightAt(cursor[0]);
            cachedY[cursor[0]] = cachedY[cursor[0]-1] + estimate;
        }
        
        var shouldResetCursorEnd = cursor[0] >= cursor[1];
        if (shouldResetCursorEnd) cursor[1] = cursor[0];
        
        if (!cachedY[cursor[1]]) cachedY[cursor[1]] = 0;
        
        
        while(cachedY[cursor[1]] < provisionLimit && cursor[1] < view.collection.length)
        {
            // console.log(cachedY[cursor[1]])
            reuseView = view.repaint( cursor[1], cachedY[cursor[1]] );
            if (!reuseView) 
                throw new Error('No ReuseView was returned from PoolView.render for idx '+cursor[1]+'.');
            
            reuseView._idx = cursor[1];
            reuseView._top = cachedY[cursor[1]];
            
            // move from unsed fragment to the items
            $items[0].appendChild(reuseView.$el[0]);
            
            cursor[1]++;
            
            cachedY[cursor[1]] = cachedY[cursor[1]-1] + reuseView.$el.height();
        }
        
        // update the max height
        if (cachedY.length >= view.collection.length || 
            Number($content.css('height').split('px')[0]) < cachedY[cachedY.length-1])
        {
            var remaining = view.collection.length - cachedY.length;
            
            $content.css('height', 
                cachedY[cachedY.length-1] + (remaining * cachedY[cachedY[1]]));
            if (iscroll)
            {
                iscroll.refresh();
            }
        }
        
        
        // console.log('range: '+range+'\ncursor:'+cursor+'\ndispose:'+
        //     disposeLimit+'\nprovision:'+provisionLimit+'\nrange:'+
        //     (provisionLimit-disposeLimit)+
        //     '\npooled:'+view._pool['li'].length+
        //     '\ndequeued:'+view._dequeued['li'].length);
    }
    
    // done update all the pools
    if (living) requestAnimationFrame(update);
}


// This view will be the container for the reuse views. It will
// control reflow to happen inside this view. New or dirty objects
// will be stored in a pool to reuse. 
var PoolView = Backbone.PoolContainerView = function(opts) 
{
    // call backbone constructor
    Backbone.View.prototype.constructor.apply(this, opts);
    
    // store the collection
    this.collection = opts.collection;
    
    // hold reference in static to watch multiple poolviews at once
    poolviews.push(this);
    
    this.render();
    
    this._$container = this.$el.find(this.$container);
    if (this._$container.length === 0) this._$container = this.$el;
    this._$container.css({'position':'absolute', 'width': '100%'});
    // this._$container.css('-webkit-transform','translate3d(0,0,0)');
    
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
        scroll.css({height: '100%'});
    else
        this._$container.css({overflowY: 'scroll', overflowX:'hidden'});
    
    update();
    
    // register for requestAnimationFrame to sync/trigger repaints
    living.add += 1;
}

_.extend(Backbone.PoolContainerView.prototype, {
    collection: null, // need to have the collection on creation
    $container: null, // jquery-selector for the container root
    
    _$container: null,
    _$content: null,
    _$items: null,
    _pool: {},
    _dequeued: {},
    _cursor: [0,0],
    _positionCache: [0], // make sure all CSS is loaded before creating the view
    _speed: [],
    
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
            return dequeue; // instance already in heap
        }
        
        // create new DOM/JS in heap and return
        var alloced = new reuseSubclass( opts );
        alloced._reuseId = id;
        
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

_.extend(Backbone.PoolContainerView.prototype, Backbone.View.prototype);
Backbone.PoolContainerView.extend = Backbone.View.extend;


}())

