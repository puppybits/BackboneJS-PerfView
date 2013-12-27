### Lighting fast Backbone

* Achieve native-level performance with the flexibility and speed of web development.
* Render pages lighting fast no matter the size of the model collection.
* ALWAYS scroll at 60 FPS.
* Stops memory from creaping up. Most PerfView will never be larger than 10 MBs.
* Easily tune performance for mobile devices.


#### Getting Started 

    var Person = Backbone.Model.extend({
        name: 'Joe',
        profileImage: 'joe.jpg'
    });
    
    var OneRow = Backbone.ReuseView.extend({
        template: _.template( $("<div class='row'><span class='username'><%= name =></span><img class='profile' src='<%= profileImage =>'></div>")),
        
        // Render will only get called once. Make sure all possible dom elements are created.
        render: function(){
            this.$el = $( this.template( this.model.toJSON() ) );
        },
        
        // When a new model is displayed it will use this mapper to update the DOM.
        modelMap: {
            'name': ['.username', 
                function setStatus($cachedElement, value){
                    $cachedElement[0].innerHTML = value;
                }
            ],
            'image': ['img.profile',
                function setProfile($cachedElement, value){
                    $cachedElement[0].src = value;
                }
            ]
        }
    });
    
    var MyPerfView = Backbone.PerfView.extend({
        // This will render the container for the rows.
        render: function() 
        {
            this.$el = $('<div>');
        },
        
        // Each time a row is needed to be displayed it will call this function.
        repaint: function( idx, position ) 
        {
            // get a row from dequeueView
            var item = this.dequeueView('myRow', OneRow);
        
            // repaint it with new data
            item.repaint(idx, position, this.collection.at(idx));
        
            // return new item
            return item;
        }
    });
    
    // Create your collection.
    var collection = new Backbone.Collection(), p;
    for (var i=0; i<1000; i++)
    {
        collection.add(new Person({name:'Joe',profileImage:'joe.png'}), {at:i})
    }
    
    // Create the perf view and pass in the collection.
    var pool = new MyPerfView({collection: collection});
    $(document.body).append(pool);

#### Stats

Desktop browsers maintain a constant 60 FPS with 1,000,000 models. Page load time is less than 3 seconds and it can scroll at 10,000+ pixels per second with images and real-world CSS.  

Mobile Safari(iPad mini) maintain a 60-45 FPS with 100,000 models. Page load time is less than 3 seconds and it can scroll at 10,000+ pixels per second with images and real-world CSS.  

#### Workbench Performance Tuning Options

#### Tips for speedy rendering

#### Troubleshooting Slowness

#### How it works

The PerfView needs to hold a collection of models to be rendered and is wrapper element in the DOM. It can either be on the body or if it's in a div it will create a scroll: overflow-y. 

PerfView will use a requestAnimationFrame to tie it's modifications to the browser's internal rendering pipeline. When a new row need to be created the repaint function will be called. In the repaint function you call the dequeueView function and pass in a string for the type of reuseView and the class of ReuseView. This will either find a dirty view or create a new instance. Next you call the repaint function on the ReuseView and pass in the model and the Y position information.

The ReuseView will call it's model mapper to selectivly update the DOM. Destroying and recreating DOM is a massive expense on the browser. This is one of the core ways that PerfView will speed render times and set a max cap on memory required for the view.

Once the ReuseView has been updated to reflect the new model it needs to be returned from the PerfView.repaint function. 

Internally the ReuseView is: 

* placing the reuse views
* marking dirty views that are no longer needed and saving them to be used later
* controlling layout boundries
* minimzing reflows as much as possible
* optimizes GPU layers for the render cycle, including smart optimizations to allow desktop and mobile GPUs to allow for texture reuse and stop memory build-up in the GPU textures
* controls network calls and image decoding on images when scrolling is too fast
* automatically binds/unbinds all updates on the model 
* updates model changes to the DOM automatically (via the model mapper functions)
* logs rendering performance with a garbage collected optimized cross-browser FPS timer
* can automatically turn on Chrome's profiler when performance slows to get precise timings on all of the JS function calls to find bottlenecks quickly


#### License

MIT
