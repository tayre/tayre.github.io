$(document).ready(function(){
    var geo = window.navigator.geolocation;
    if (geo) {
        geo.getCurrentPosition(function(position){
        
            var latitude = position.coords.latitude;
            var longitude = position.coords.longitude;
            var apiUrl = 'http://maps.google.com/maps/api/staticmap'
            var zoom = 8;
            var mapType = 'roadmap';
            var width = 640;
            var height = 640;
            
            var imageSource = apiUrl + '?center=' + latitude + ',' + longitude + '&zoom=' + zoom + '&size=' + width + 'x' + height + '&maptype=' + mapType + '&markers=color:blue|' + latitude + ',' + longitude + '&sensor=false';
            
            $('img').attr('src', imageSource);
        });
    }
    
});
