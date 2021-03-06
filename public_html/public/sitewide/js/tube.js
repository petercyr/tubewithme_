
Tube = function( conf, vid ) {

	var self = this;

	this.vid = vid || null;
	this.type = null;

	this.conf = $.extend({
		sio: '/'
	}, conf);

	this.socket = io.connect( this.conf.sio );
	this.loggedIn = false;
	this.user = false;
	this.player = null;
	this.roomId = null;
	this.roomUsers = {};
	this.containers = {
		users: null,
		playlist: null
	};
	this.playlist = new Playlist(this);

	// Check login status on socket.io connection
	this.socket.on('connect', function(self) {
		self.socket.emit('checkLogin');
	}(this));

	// Receive login status
	this.socket.on('receiveLogin', function(data) {
		if( data ) {
			self.user = data;
			updateLoggedInUserUI(data);
			self.checkQueue();
		}
	});

};

Tube.prototype.checkQueue = function() {

	var self = this;

	var queue = Tube.Utils.Cookie.get('queue') || null;

	if( queue ) {
		queue = JSON.parse(queue);

		Tube.Utils.Cookie.remove('queue');
		//console.log('queue', queue);
		self.launch(queue.type, queue.vid);
		return true;
	}
	return false;
};

Tube.prototype.launch = function(type, vid) {
	
	var self = this;

	self.type = type;
	if( type == 'youtube' ) {
		self.vid = vid;
	} else {
		self.roomId = vid;
	}

	//console.log('launch type/vid', type, vid );

	/* set video id, get object containing the type of video (youtube or tubewithme) and the ID */
	
	$('.p1, .inputFields').hide();
	$('.container').append('<div class="tuberoomContainer"></div>');

	window.onYouTubePlayerReady = function(playerId) {
		tube.player = new Tube.Player( document.getElementById("ytPlayer"), tube );
	}

	/* 
		Load base room markup from external doc
		Once loaded, create the youtube player and setup the room
	*/
	$('.tuberoomContainer').load('/sitewide/html/tuberoom.html', function() {

		$('.container').addClass('active');

		var params = { allowScriptAccess: "always" };
        // The element id of the Flash embed
        var atts = { id: "ytPlayer" };
        // All of the magic handled by SWFObject (http://code.google.com/p/swfobject/)
        swfobject.embedSWF("http://www.youtube.com/apiplayer?" +
                           "version=3&enablejsapi=1&playerapiid=player1",
                           "videoDiv", "690", "388", "9", null, null, params, atts);

        /* 
			if type is youtube, create a new room for it, if not, get all the details for that room
			and join it
		 */
		if( self.type == 'youtube' ) {
			//console.log('youtube video. requesting room');
			/* request a random room ID and pass the initial vid to it */
			self.createTubeRoom( self.vid );
			//console.log('self.vid', self.vid);
		} else {
			//console.log('internal vid.. joining room', self.roomId );
			self.joinRoom( self.roomId );
		}

		/* set often used containers */
		self.containers = {
			users: $('.users'),
			playlist: $('.playlist')
		};

		/* Initialize playlist */
		self.playlist.init();

		var youtubeSearchTimer = '';
		/* live search */
		$('.searchInput').keydown( function(event) {
			clearInterval( youtubeSearchTimer );
			if( $('.searchInput').val() != "" ) {
				if( event.which == 13 ) {
						self.socket.emit('searchYoutube', {
							keywords: encodeURIComponent( $('.searchInput').val() )
						});
						$('.searchInput').addClass('loading');
				} else {
					youtubeSearchTimer = setTimeout( function() {
						self.socket.emit('searchYoutube', {
							keywords: encodeURIComponent( $('.searchInput').val() )
						});
					}, 1000);
					$('.searchInput').addClass('loading');
				}
			} else {
				$('.searchInput').removeClass('loading');
			}
		});


		/* scrubber actions */
		$('.scrubber').click( function(e) {
			console.log( $(this) );
			var parentOffset = $(this).parent().offset();
			var relX = e.pageX - parentOffset.left;
			console.log( relX );

			console.log( 'self', self );
			console.log( relX / 690 * self.player.playerStatus.videoDuration );

			self.player.player.seekTo( relX / 690 * self.player.playerStatus.videoDuration );
		});
	});

	/* receiving server generated room id */
	this.socket.on('newRoomId', function(data) {
		self.roomId = data;
		$('.room .id').html( data );

		/* 
			since we just made this room, lets go ahead and
			start playing the video we launched in the first place
		*/
		//console.log( 'newRoomId setRoom vid', 'data:', data, 'vid: ', self.vid);
		// self.setRoomVid( data, self.vid );
	});

	/* Receive room users */
	this.socket.on('roomUser', function(data) {
		// only recreate the user locally if he doesn't already exist
		if( !(data.uid in self.roomUsers) ) {
			self.roomUsers[data.uid] = new Tube.User(data, self);
		}
	});

	/* Receive user disconnection msg */
	this.socket.on('userDisconnected', function(uid) {
		self.roomUsers[uid].container.fadeOut('slow', function() {
			self.roomUsers[uid].container.remove();
			delete self.roomUsers[uid];
		});
	});

	/* receive the video currently playing in the room */
	this.socket.on('roomDetails', function(data) {
		//console.log( data );
	});

	/* confirmation of joined room */
	this.socket.on('roomJoined', function(data) {
		self.roomId = data;
		$('.room .id').html( data );
		self.socket.emit('getRoomPlaylist', data );
	});

	/* Listens for video changes */
	this.socket.on('updateRoomVideo', function( vid) {
		//console.log('updateRoomVideo:' + vid);
		self.vid = vid;
		//console.log('self.player', self.player);
		try {
			self.player.playVideoById( vid );
		} catch (e) {};
	});

	/* Listen for server sending videos */
	this.socket.on('playListVideo', function(video){
		self.playlist.addVideo( video );
		console.log( 'on playListVideo: ', video );
	});


	/* receives youtube results */
	this.socket.on('youtubeSearchResults', function( results ) {

		$('.searchInput').removeClass('loading');
		
		$results = jQuery.parseXML( results );
		$('.searchResults .results li').fadeOut('fast');

		window.resultXML = results;

		if( $.browser.chrome ) {
			$('.searchBrowser .startIndex').html( $( $results ).find('startIndex').text() );
			$('.searchBrowser .maxResults').html( $( $results ).find('totalResults').text() );
		} else {
			$('.searchBrowser .startIndex').html( $( $results ).find('openSearch\\:startIndex').text() );
			$('.searchBrowser .maxResults').html( $( $results ).find('openSearch\\:totalResults').text() );
		}
		$('.searchBrowser').css('display', 'inline');

		//window.results = [];

		$( $results ).find('entry').each( function() {
			var li = $('<li><img class="thumb" /><span class="title"></span><span class="duration"></span><div class="options"><a class="play">Play Now</a><a class="queue">Queue in playlist</a></div></li>');
			var item = $(this);

			//window.results.push( this );

			if( $.browser.chrome ) {
				// fetch video ID
				li.find('a').attr('data-video', item.find("videoid").text() );
				li.find('.thumb').attr('src', item.find("thumbnail[height='180']").attr('url') );
				li.find('.title').html( item.find('title').text().substr(0,50) );
				li.attr('data-title', item.find('title').text() );
				li.find('.duration').html( rectime( item.find("duration").attr('seconds') ) );
			} else {
				// fetch video ID
				li.find('a').attr('data-video', item.find("yt\\:videoid").text() );
				li.find('.thumb').attr('src', item.find("media\\:thumbnail[height='180']").attr('url') );
				li.find('.title').html( item.find('title').text().substr(0,50) );
				li.attr('data-title', item.find('title').text() );
				li.find('.duration').html( rectime( item.find("yt\\:duration").attr('seconds') ) );
			}
			
			

			li.find('.play').click( function() {
				self.player.playVideoById( $(this).attr('data-video') );
				self.setRoomVid( self.roomId, $(this).attr('data-video') );
			});

			li.find('.queue').click( function() {
				var element = this;
				console.log( this );
				console.log( $(this).parent() );
				console.log( $(this).parent().parent() );
				self.socket.emit('addVideoRoomPlaylist', { 
					roomId: self.roomId, 
					vid: $(element).attr('data-video'),
					img: $(element).parent().parent().find('.thumb').attr('src'),
					title: $(element).parent().parent().attr('data-title')
				});
			});


			li.hide();

			$('.searchResults .results').append(li);
			li.fadeIn('fast', function() {
				li.css('display', 'inline-block');
			});
		});

		
	});


};

Tube.prototype.createTubeRoom = function(vid) {
	this.socket.emit('createTubeRoom', vid);
};

Tube.prototype.setRoomVid = function( roomId, vid ) {
	//console.log('setRoomVid: ', { roomId: roomId, vid: vid });
	var data = {
		roomId: roomId,
		vid: vid
	};
	this.socket.emit( 'setRoomVid', data );
};

Tube.prototype.joinRoom = function( roomId ) {
	//console.log('joinRoom:', roomId );
	this.socket.emit( 'joinRoom', roomId );
};

Tube.prototype.parseUrl = function( url ) {

    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    if ( match && match[7].length == 11 ) {
        return { type: 'youtube', id: match[7] };
    } else {
        return { type: 'tubeid', id: url };
    }

};

Tube.Player = function( player, parent ) {

	var self = this;
	this.parent = parent;
	this.container = $('.videoContainer');
	this.player = player;
	this.status = 'off';

	this.init();
	this.addControls();
	this.updateInterval = null;

	this.progressBar = $('.scrubber .expand');

	this.playerStatus = {
		videoDuration: null,
		videoCurrentTime: null,
		playerStatus: null
	};
};

Tube.Player.prototype.init = function() {

	var self = this;
	
	this.player.addEventListener('onStateChange', 'tube.player.onPlayerStateChange');
	this.player.addEventListener('onError', 'tube.player.onError');

	this.player.loadVideoById( this.parent.vid );
	// this.player.cueVideoById( this.parent.vid );
	// ytplayer.addEventListener('')
	
	setInterval( function() {
		self.updatePlayerStatus();
	}, 200);

	self.parent.socket.on('userUpdates', function(data) {
		//console.log( data );
		//console.log( 'self', self );
		self.parent.roomUsers[data.user].updateUserStatus( data );
	});
};

Tube.Player.prototype.playVideoById = function( vid ) {
	this.player.loadVideoById( vid );
};

Tube.Player.prototype.onPlayerStateChange = function(newState) {

	this.playerStatus.playerStatus = newState;
	switch( newState ) {
		case -1:
			//console.log( 'not started' );
			this.reportStatus();
			this.startReportingPlayerStatus(2000);
			break;
		case 0:
			//console.log( 'ended' );
			this.reportStatus();
			this.startReportingPlayerStatus(2000);
			break;
		case 1:
			//console.log( 'playing' );
			this.reportStatus();
			this.startReportingPlayerStatus(500);
			break;
		case 2:
			//console.log( 'buffering or paused' );
			this.reportStatus();
			this.startReportingPlayerStatus(2000);
			break;
		case 3:
			//console.log( 'buffering' );
			this.reportStatus();
			this.startReportingPlayerStatus(2000);
			break;
		case 5:
			//console.log( 'queued' );
			this.reportStatus();
			this.startReportingPlayerStatus(2000);
			break;
	}
};

Tube.Player.prototype.updatePlayerStatus = function() {
	this.playerStatus.videoDuration = this.player.getDuration();
	this.playerStatus.videoCurrentTime = this.player.getCurrentTime();

	this.progressBar.css('width', (this.playerStatus.videoCurrentTime / this.playerStatus.videoDuration * 690) + 'px' );
};

Tube.Player.prototype.reportStatus = function() {
	
	var self = this;

	self.parent.socket.emit('updateUserPlayerStatus', {
		user: self.parent.user.user_id,
		room: self.parent.roomId,
		playerStatus: self.playerStatus
	});
};

Tube.Player.prototype.startReportingPlayerStatus = function( interval ) {
	var self = this;

	// clear before starting a new one
	clearInterval( this.updateInterval );

	interval = interval || 500;

	self.updateInterval = setInterval( function() {
		self.reportStatus();
	}, interval);
};

Tube.Player.prototype.stopReportingPlayerStatus = function() {
	clearInterval( this.updateInterval );
};

Tube.Player.prototype.onError = function(error) {
	//console.log( error );
};

Tube.Player.prototype.addControls = function() {

	var self = this;

	$('.controls .playpause').click( function() {
		
		if( jQuery(this).hasClass('pause') ) {
			self.player.playVideo();
		} else {
			self.player.pauseVideo();
		}
		jQuery(this).toggleClass('pause');
	});

		
	this.container.find('.load').click( function() {
		self.player.loadVideoById( parseUrl( parseUrl( $('.youtubeUrl').val() ).vid ) );
		self.parent.setRoomVid( self.parent.roomId, parseUrl( $('.youtubeUrl').val() ).vid );
	});
};

function rectime(sec) {
	var hr = Math.floor(sec / 3600);
	var min = Math.floor((sec - (hr * 3600))/60);
	sec -= ((hr * 3600) + (min * 60));
	sec += ''; min += '';
	while (min.length < 2) {min = '0' + min;}
	while (sec.length < 2) {sec = '0' + sec;}
	hr = (hr)?':'+hr:'';
	return hr + min + ':' + sec;
}