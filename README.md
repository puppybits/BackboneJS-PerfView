### Lighting fast Backbone

* Achieve native-level performance with the flexibility and speed of web development.
* Render pages lighting fast no matter the size of the model collection.
* ALWAYS scroll at 60 FPS on desktop. Mobile is usually at 60 FPS. Very complex views on mobile can fluctuate between 45 and 60 FPS.
* Stops memory from creaping up. Most PerfView will never be larger than 10 MBs.
* Optimizes memory usage, network calls, image decoding, heavy DOM updates and GPU texture memory all with one simple API. Basically 90% of what needs to be done to have a performant app is done by the library.
* Easily tune performance and see the impact that CSS, DOM or JS has on your app.
* Especially needed on mobile web apps where memory, network and cpu time is all very low.


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

#### Starting the Workbench

The workbench also has working sample that illustrates some more complex topics and has options to view on mobile and with different performance hits from CSS and model event changes.  

To start the workbench, navigate to the root folder for PerfView in Command Prompt or Terminal. Run the command `python -m SimpleHTTPServer && open localhost:8000/workbenches/index.html`  

##### Workbench performance stress tests

**CSS stress test:** Add the `stress-test-css` class to the body or call `window.stress.css(true)`  

**Backbone events stress test:** Add the `stress-test-events` class to the body or call `window.stress.events(true)`  

**Backbone autoscroll stress test:** Add the `stress-test-events` class to the body or call `window.stress.autoscroll(true)`  

**Backbone loading images stress test:** To turn off images call `window.stress.loadimages(true)`  



#### Stats

Desktop browsers maintain a constant 60 FPS with 1,000,000 models. Page load time is less than 3 seconds and it can scroll at 10,000+ pixels per second with images and real-world CSS.  

Mobile Safari(iPad mini) maintain a 60-45 FPS with 100,000 models. Page load time is less than 3 seconds and it can scroll at 10,000+ pixels per second with images and real-world CSS.  

#### Performance Tuning Options

Toggle debugging and inspection options with Backbone.PrefView.config

**Backbone.PrefView.config.batchAppendViews** Batch all the changes into Document fragments. Could be awesome or suck horribly. It depends on the browser and it's implementation. default - false.

**Backbone.PrefView.config.staticHeights** Give massive speed boost by not asking the DOM for height. Heights need to be calculated inside a loop and calling the height property triggers an expensive browser call to check the DOM. Wilson Page's layout boundries helps to make this quicker when turned off. default - true.


**Backbone.PrefView.config.fastScrollingRate** When the scroll reaches a certain speed loading images and listening for model event changes won't every be reflected in the view and are very expensive. This will disable images and model event listeners. This speed number isn't attached to pixels or anything. default - 30.

**Backbone.PrefView.config.scrollingSampleSize** Length of array to store scroll speed. default - 10

**Backbone.PrefView.config.destoryLag** How many pixels above the top fold to leave before recycling DOM elements. Value is a multiplied by the scroll view height. default - 3.0

**Backbone.PrefView.config.drawTrigger** How many pixels above the below fold to draw on the DOM before needing to start a new redraw. Value is a multiplied by the scroll view height. default - 3.0

**Backbone.PrefView.config.drawTrigger** Home many pixels behind the drawAhread to wait until triggering DOM elements to move. Value is multiplied by the scroll view height. Must be smaller than drawAhead. default - 1.0

**Backbone.PrefView.config.debug.fps** A super light and informative inspection of scroll perfromance. Turn this on first thing when debugging anything! default - false

**Backbone.PrefView.config.debug.profile** Allow auto-on when heavy loads are hit. Must have fps true frist. Profile take a ton of extra load. Use sparingly and don't take any time to be real. I've found it's about 6 times slower than normal on desktop Chrome. default - false.

#### Tips for speedy rendering

#### Troubleshooting Slowness

#### How it works

The PerfView needs to hold a collection of models to be rendered and is wrapper element in the DOM. It can either be on the body or if it's in a div it will create a scroll: overflow-y. 

PerfView will use a requestAnimationFrame to tie it's modifications to the browser's internal rendering pipeline. When a new row need to be created the repaint function will be called. In the repaint function you call the dequeueView function and pass in a string for the type of reuseView and the class of ReuseView. This will either find a dirty view or create a new instance. Next you call the repaint function on the ReuseView and pass in the model and the Y position information.

The ReuseView will call it's model mapper to selectivly update the DOM. Destroying and recreating DOM is a massive expense on the browser. This is one of the core ways that PerfView will speed render times and set a max cap on memory required for the view.  

There is one caveat to the ReuseViews. ReuseViews can not have logic inside the template partial. This allows for lighting fast DOM updates and also helps guide developers into better pratices. If there is logic in a partial then you really need to write unit tests for all that logic but code coverage libraries don't count .html partials. Keeping logic out of the partials makes cleaner code, more scalable code, allows the browser to work faster and with the model mapper it allows developers the flexibility they want.

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
