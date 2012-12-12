
var tube = null;

$(function() {
	tube = new Tube({
		sio: 'http://localhost:8080'
	});
});

function updateLoggedInUserUI(user) {
	$('.userInfo .pic').attr('src', user.profile_image);
	$('.userInfo .name').html( user.name );
	$('.userInfo').fadeIn();
}

function parseUrl( url ) {

    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    if ( match && match[7].length == 11 ) {
        return { type: 'youtube', vid: match[7] };
    } else {
        return { type: 'tubeid', vid: url };
    }

};

/* on ready */
$(function() {
	$('button.startWatching').click( function() {
    var vid = parseUrl( $('.url').val() );

		if( tube.user ) {
			if( !tube.checkQueue() ) {
				tube.launch( vid.type, vid.vid );
			}
		} else {
			Tube.Utils.Cookie.set('queue', JSON.stringify(vid) );
			window.location = '/auth/twitter';
		}
	});
});