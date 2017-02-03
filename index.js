( function ($, L, prettySize) {
    var map, lines;

    // Start at the beginning
    stageOne();

    function stageOne() {
        var dropzone;

        // Initialize the map
        map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'location-history-visualizer is open source and available <a href="https://github.com/theopolisme/location-history-visualizer">on GitHub</a>. Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors.',
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
        lines = L.polyline([], {
            color: "blue",
            smoothFactor: 2.0,
            opacity: 0.7,
            interactive: false,
            weight: 2
        }).addTo(map);

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

                var moving_avg_vals = [];

                function moving_average(value) {
                    if (moving_avg_vals.length >= 5) {
                        moving_avg_vals.pop();
                    }
                    moving_avg_vals.unshift(value);
                    var sum = moving_avg_vals.reduce(function (pv, cv) {
                        return pv + cv;
                    }, 0);
                    return sum / moving_avg_vals.length;
                }

                var total_dist = 0;
                return [locations.reduce(function (a, location, index, array) {

                    if (index > 0) {
                        var lat_long = [location.latitudeE7 * SCALAR_E7, location.longitudeE7 * SCALAR_E7];
                        var lat_long_prev = [array[index - 1].latitudeE7 * SCALAR_E7, array[index - 1].longitudeE7 * SCALAR_E7];
                        var dist = distance(lat_long[0], lat_long[1], lat_long_prev[0], lat_long_prev[1]);
                        var time = (array[index - 1].timestampMs - location.timestampMs) / (1000 * 60 * 60);
                        var vel = dist / time;

                        // disgard rediculous
                        if (vel > 1000 || vel < 5) {
                            return a;
                        }

                        var moving_avg = moving_average(vel);
                        if (moving_avg > 30) {
                            // Join points from the same journey
                            if (a[a.length - 1] !== undefined) {
                                lat_long_past = a[a.length - 1].from;
                                time_prev = a[a.length - 1].time;
                                dist = distance(lat_long[0], lat_long[1], lat_long_past[0], lat_long_past[1]);
                                if (dist < 1 && (location.timestampMs - time_prev) < 3600) {
                                    a[a.length - 1].from = lat_long;
                                    return a;
                                }
                            }
                            a.push({to: lat_long_prev, from: lat_long, time: location.timestampMs});
                        }
                    }
                    return a;
                }, []).map(function (location) {
                    dist = distance(location.to[0], location.to[1], location.from[0], location.from[1]);
                    if (dist) {
                        total_dist += dist;
                    }
                    return [location.to, location.from];
                }), total_dist];

                function distance(lat1, lon1, lat2, lon2) {
                    var radlat1 = Math.PI * lat1 / 180;
                    var radlat2 = Math.PI * lat2 / 180;
                    var theta = lon1 - lon2;
                    var radtheta = Math.PI * theta / 180;
                    var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
                    dist = Math.acos(dist);
                    dist = dist * 180 / Math.PI;
                    dist = dist * 60 * 1.1515;
                    return dist * 1.609344;
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

                lines.setLatLngs(latlngs[0]);
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
