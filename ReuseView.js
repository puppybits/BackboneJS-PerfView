(function(){

var isImg = /^img/,
clearImgs = function(imgs)
{
    len = imgs.length;
    for(i=0; i<len; i++)
    {
        imgs[i].src = null;
        imgs[i].src = '';
    }
}

var ReuseView = Backbone.ReuseView = function(opts) 
{
    // call backbone constructor
    Backbone.View.prototype.constructor.apply(this, opts);
    
    this.model = opts.model || null;
    
    this.render();
    
    this.$el.css('position', 'absolute');
    this.$el.css('webkitTransform', 'translateZ(0)');
    
    // console.log('alloced: '+this.$el.find('.first').html())
    
    // cache DOM elements that need data updates
    for(var name in this.modelMap)
    {
        var selector = this.modelMap[name][0];
        this._$cached[name] = this.$el.find(selector);
    }
    
    this._$imgs = this.$el.find('img');
    
    // set the model, cache the template and add watch listeners
    this._repurpose(this.model);
}

_.extend(ReuseView.prototype, {
    model: null,   // backbone model(s) are passed in on creation/repurpose
    modelMap: {},  // { modelProperty: [selector, updateFunction]}
    _reuseId: null,
    _$imgs: null,
    _$cached: {},
    _idx: null,
    _top: null,
    _saveMemoryMode: true,
    standardHeight: 1,
    
    _repurpose: function(model)
    {
        // dealloc the old model
        if (this.model)
        {
            for (name in this.modelMap)
            {
                this.model.off('change:'+name);
            }
        }
        
        this.model = model;
        
        // register for events on model changes
        if (!this._freezeAllocations)
        {
            for (name in this.modelMap)
            {
                this.model.on('change:'+name, this.updateModel);
            }
        }
    },
    
    // render ->  _.template(this.partial).compiled(model)
    // note: all the html needs to be rendered
        
    repaint: function( idx, position, backboneModel ) 
    {
        // set the position as absolute
        var pos = {
            // 'top' : position
            'webkitTransform': 'translateY('+position+'px)'
        }, i, len, name;
        
        // update the position
        this.$el.css( pos );
        
        clearImgs(this._$imgs);
        
        this._repurpose(backboneModel);
        
        // update the DOM with the new model
        for(name in this.modelMap)
        {
            var sel = this.modelMap[name][0];
            if (!this._freezeAllocations && isImg.exec(sel)) continue;
            
            var el = this.$el.find(sel);
            var val = this.model.get(name);
            var fnc = this.modelMap[name][1];
            
            fnc.call(this, el, val)
        }
        
        // allow the reflow/repaints to happend
    },
    
    _evtModel: function(evt)
    {
        new Throw('TODO: get model name from event');
        this.updateModel(this.model, name);
    },
    
    _updateModel: function(model, name)
    {
        var fnc = this.modelMap[name];
        fnc(this.$el.find(name), model.get(name));
    },
    
    _freezeAllocations: function(shouldDelay)
    {
        var imgs;
        
        this._saveMemoryMode = shouldDelay;
        
        if (!shouldDelay)
            return clearImgs(this._$imgs);
        
        for(name in this.modelMap)
        {
            this.model.on('change:'+name, this.updateModel);
            
            var sel = this.modelMap[name][0];
            if (!isImg.exec(sel)) continue;
            
            var el = this.$el.find(sel);
            var val = this.model.get(name);
            var fnc = this.modelMap[name][1];
            
            fnc.call(this, el, val)
        }
    }
});

_.extend(ReuseView.prototype, Backbone.View.prototype);
ReuseView.extend = Backbone.View.extend;

}());

