( function ($, L, prettySize) {
    var map, lines;

    // Start at the beginning
    stageOne();

    function stageOne() {
        var dropzone;

        // Initialize the map
        map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors.',
            maxZoom: 18,
            minZoom: 2
        }).addTo(map);

        // Initialize the dropzone
        dropzone = new Dropzone(document.body, {
            url: '/',
            previewsContainer: document.createElement('div'), // >> /dev/null
            clickable: false,
            accept: function (file, done) {
                stageTwo(file);
                dropzone.disable(); // Your job is done, buddy
            }
        });

        // For mobile browsers, allow direct file selection as well
        $('#file').change(function () {
            stageTwo(this.files[0]);
            dropzone.disable();
        });
    }

    function stageTwo(file) {
        // lines = L.polyline([], {
        //     color: "blue",
        //     smoothFactor: 2.0,
        //     opacity: 0.7,
        //     interactive: false,
        //     weight: 2
        // }).addTo(map);

        // First, change tabs
        $('body').addClass('working');
        $('#intro').addClass('hidden');
        $('#working').removeClass('hidden');

        // Now start working!
        processFile(file);

        function status(message) {
            $('#currentStatus').text(message);
        }

        function processFile(file) {
            var fileSize = prettySize(file.size),
                reader = new FileReader();

            status('Preparing to import file (' + fileSize + ')...');

            function getLocationDataFromJson(data) {
                var SCALAR_E7 = 0.0000001, // Since Google Takeout stores latlngs as integers
                    locations = JSON.parse(data).locations;

                if (!locations || locations.length === 0) {
                    throw new ReferenceError('No location data found.');
                }

                var total_dist = 0;
                return [locations.reduce(function (a, location, index, array) {
                    if (location.accuracy > 1000) {
                        return a;
                    }

                    if (index > 0) {
                        var lat = location.latitudeE7 * SCALAR_E7;
                        var long = location.longitudeE7 * SCALAR_E7;
                        var time = location.timestampMs / 1000;
                        var time_prev = array[index - 1].timestampMs / 1000;
                        var lat_prev = array[index - 1].latitudeE7 * SCALAR_E7;
                        var long_prev = array[index - 1].longitudeE7 * SCALAR_E7;

                        var lat_long = [lat, long];
                        var lat_long_prev = [lat_prev, long_prev];
                        var dist = distance_on_unit_sphere(lat_long[0], lat_long[1], lat_long_prev[0], lat_long_prev[1]);
                        var dist_time = (time_prev - time) / (60 * 60);
                        var vel = dist / dist_time;

                        // disgard rediculous
                        if (vel < 40) {
                            return a;
                        }

                        // Join points from the same journey
                        if (a[a.length - 1] !== undefined) {
                            var time_past = a[a.length - 1].timeStart;
                            if ((time_past - time) < (60 * 60)) {
                                a[a.length - 1].from = lat_long;
                                a[a.length - 1].timeStart = time;
                                return a;
                            }
                        }
                        a.push({to: lat_long_prev, from: lat_long, timeEnd: time_prev, timeStart: time});
                    }
                    return a;
                }, []).map(function (location) {
                    dist = distance_on_unit_sphere(location.to[0], location.to[1], location.from[0], location.from[1]);
                    if (dist) {
                        total_dist += dist;
                    }
                    vel = (dist * 60 * 60) / (location.timeEnd - location.timeStart);
                    if (dist > 200 && vel > 200) {
                        L.Polyline.Arc(location.from, location.to, {
                            vertices: 100,
                            color: "#" + ((1 << 24) * Math.random() | 0).toString(16)
                        }).addTo(map);
                    }
                    return [location.to, location.from];
                }), total_dist];

                function distance_on_unit_sphere(lat1, long1, lat2, long2) {
                var degrees_to_radians = Math.PI / 180.0;
                var phi1 = (90.0 - lat1) * degrees_to_radians;
                var phi2 = (90.0 - lat2) * degrees_to_radians;
                var theta1 = long1 * degrees_to_radians;
                var theta2 = long2 * degrees_to_radians;

                var cos = (Math.sin(phi1) * Math.sin(phi2) * Math.cos(theta1 - theta2) + Math.cos(phi1) * Math.cos(phi2));
                var arc = Math.acos(cos);
                return arc * 6378.1;
            }
            }

            reader.onprogress = function (e) {
                var percentLoaded = Math.round(( e.loaded / e.total ) * 100);
                status(percentLoaded + '% of ' + fileSize + ' loaded...');
            };

            reader.onload = function (e) {
                var latlngs;

                status('Generating map...');

                try {
                    latlngs = getLocationDataFromJson(e.target.result);
                } catch (ex) {
                    status('Something went wrong generating your map. Ensure you\'re uploading a Google Takeout JSON file that contains location data and try again, or create an issue on GitHub if the problem persists. (error: ' + ex.message + ')');
                    return;
                }

                // lines.setLatLngs(latlngs[0]);
                stageThree(/* numberProcessed */ latlngs[1]);
            };

            reader.onerror = function () {
                status('Something went wrong reading your JSON file. Ensure you\'re uploading a "direct-from-Google" JSON file and try again, or create an issue on GitHub if the problem persists. (error: ' + reader.error + ')');
            };

            reader.readAsText(file);
        }
    }

    function stageThree(numberProcessed) {
        var $done = $('#done');

        // Change tabs :D
        $('body').removeClass('working');
        $('#working').addClass('hidden');
        $done.removeClass('hidden');

        // Update count
        $('#numberProcessed').text(numberProcessed.toLocaleString());

        // Fade away when clicked
        $done.one('click', function () {
            $('body').addClass('map-active');
            $done.fadeOut();
        });
    }

}(jQuery, L, prettySize) );
