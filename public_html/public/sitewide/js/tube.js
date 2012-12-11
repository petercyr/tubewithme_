
Tube = function( conf, vid ) {

	var self = this;

	this.vid = vid || null;
	this.type = null;

	this.conf = $.extend({
		sio: 'http://tubewithme.local:8080'
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
		console.log('queue', queue);
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

		var params = { allowScriptAccess: "always" };
        // The element id of the Flash embed
        var atts = { id: "ytPlayer" };
        // All of the magic handled by SWFObject (http://code.google.com/p/swfobject/)
        swfobject.embedSWF("http://www.youtube.com/apiplayer?" +
                           "version=3&enablejsapi=1&playerapiid=player1",
                           "videoDiv", "690", "448", "9", null, null, params, atts);

        /* 
			if type is youtube, create a new room for it, if not, get all the details for that room
			and join it
		 */
		if( self.type == 'youtube' ) {
			console.log('youtube video. requesting room');
			self.requestRoomId();
			console.log('self.vid', self.vid);
		} else {
			console.log('internal vid.. joining room', self.roomId );
			self.joinRoom( self.roomId );
		}

		/* set often used containers */
		self.containers = {
			users: $('.users'),
			playlist: $('.playlist')
		};

	});

	/* receiving server generated room id */
	this.socket.on('newRoomId', function(data) {
		self.roomId = data;
		$('.room .id').html( data );

		/* 
			since we just made this room, lets go ahead and
			start playing the video we launched in the first place
		*/
		console.log( 'newRoomId setRoom vid', 'data:', data, 'vid: ', self.vid);
		self.setRoomVid( data, self.vid );
	});

	/* Receive room users */
	this.socket.on('roomUser', function(data) {
		console.log( data );
		self.roomUsers[data.uid] = new Tube.User(data, self);
	});

	/* receive the video currently playing in the room */
	this.socket.on('roomDetails', function(data) {
		console.log( data );
	});

	/* confirmation of joined room */
	this.socket.on('roomJoined', function(data) {
		self.roomId = data;
		$('.room .id').html( data );
	});

	/* Listens for video changes */
	this.socket.on('updateRoomVideo', function(data) {
		self.player.playVideoById( data );
	});

};

Tube.prototype.requestRoomId = function(video) {
	console.log('requesting room');
	this.socket.emit('requestRoomId');
	//this.setRoomVid( video );
};

Tube.prototype.setRoomVid = function( roomId, vid ) {
	console.log('setRoomVid: ', { roomId: roomId, vid: vid });
	var data = {
		roomId: roomId,
		vid: vid
	};
	this.socket.emit( 'setRoomVid', data );
};

Tube.prototype.joinRoom = function( roomId ) {
	console.log('joinRoom:', roomId );
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
		console.log( data );
		console.log( 'self', self );
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
			console.log( 'not started' );
			break;
		case 0:
			console.log( 'ended' );
			break;
		case 1:
			console.log( 'playing' );
			this.startReportingPlayerStatus();
			break;
		case 2:
			console.log( 'buffering or paused' );
			this.stopReportingPlayerStatus();
			break;
		case 3:
			console.log( 'buffering' );
			break;
		case 5:
			console.log( 'queued' );
			break;
	}
};

Tube.Player.prototype.updatePlayerStatus = function() {
	this.playerStatus.videoDuration = this.player.getDuration();
	this.playerStatus.videoCurrentTime = this.player.getCurrentTime();
};

Tube.Player.prototype.startReportingPlayerStatus = function() {
	var self = this;

	self.updateInterval = setInterval( function() {
		self.parent.socket.emit('updateUserPlayerStatus', {
			user: self.parent.user.user_id,
			room: self.parent.roomId,
			playerStatus: self.playerStatus
		} );
	}, 500);
};

Tube.Player.prototype.stopReportingPlayerStatus = function() {
	clearInterval( this.updateInterval );
};

Tube.Player.prototype.onError = function(error) {
	console.log( error );
};

Tube.Player.prototype.addControls = function() {

	var self = this;

	this.container.find('.play').click( function() {
		self.player.playVideo();
	});

	this.container.find('.pause').click( function() {
		self.player.pauseVideo();
	});

	this.container.find('.load').click( function() {
		self.player.loadVideoById( $('.youtubeUrl').val() );
	});
};

