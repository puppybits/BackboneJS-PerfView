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
    this.forceGPUTexture = opts.forceGPUTexture || false;
    
    this.render();
    
    this.height = (this.height ? this.height : _.bind(this.$el.height, this.$el));
    
    this.$el.css( (!this.forceGPUTexture ? 
                {position: 'absolute'} :
                {webkitTransform: 'translate3d(0,0,0)'} ));
    
    // console.log('alloced: '+this.$el.find('.first').html())
    
    // cache DOM elements that need data updates
    this._$cached = {};
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
    _saveMemoryMode: false,
    height: null, // replace this with a function that returns a static height for faster performance
    forceGPUTexture: false,
    
    _repurpose: function(model)
    {
        // dealloc the old model
        if (model && this.model)
        {
            for (name in this.modelMap)
            {
                this.model.off('change:'+name);
            }
            
            this.model = model;
        }
        
        var sel, el, val, fnc;
        for(name in this.modelMap)
        {
            sel = this.modelMap[name][0];
            if (this._saveMemoryMode && isImg.exec(sel)) continue;
            
            // register for new events if not saving memory
            if (!this._saveMemoryMode)
            {
                this.model.on('change:'+name, _.bind(this._modelChanged, this));
            }
            
            // update the DOM
            el = this._$cached[name];
            val = this.model.get(name);
            fnc = this.modelMap[name][1];
            
            fnc.call(this, el, val)
        }
    },
    
    // pool view triggers repaint when there is a new model and position    
    repaint: function( idx, position, backboneModel ) 
    {
        // set the position as absolute
        var pos = (!this.forceGPUTexture ? 
            {'top': position} :
            {'webkitTransform': 'translate3d(0, '+position+'px, 0)'}), 
        i, len, name;
        
        // update the position
        this.$el.css( pos );
        
        // update the model and the dom
        clearImgs(this._$imgs);
        this._repurpose(backboneModel);
        
        // allow the reflow/repaints to happend
    },
    
    staticHeight: function()
    {
        // override if poolView is set to staticHeights option
    },
    
    _modelChanged: function(evt)
    {
        this._updateModel(this.model, Object.keys(evt.changed)[0]);
    },
    
    _updateModel: function(model, name)
    {
        var fnc = this.modelMap[name][1];
        fnc(this._$cached[name], model.get(name));
    },
    
    _freezeAllocations: function(shouldDelay)
    {
        var imgs;
        
        this._saveMemoryMode = shouldDelay;
        
        if (!shouldDelay) return clearImgs(this._$imgs);
        
        // else when turning back on then draw images and listen for model events
        this._repurpose();
    }
});

_.extend(ReuseView.prototype, Backbone.View.prototype);
ReuseView.extend = Backbone.View.extend;

}());

