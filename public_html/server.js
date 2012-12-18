var http 			= require('http'),
	express 		= require('express'),
	app 			= express(),
	server 			= require('http').createServer(app),
	io 				= require('socket.io').listen(server),
	oauth 			= require('oauth').OAuth,
	redisStore 		= require('connect-redis')(express),
	redis 			= require('redis'),
	sessionStore 	= new redisStore(),
	cookie 			= require('cookie'),
	client 			= redis.createClient(),
	db 				= require('./redis.js'),
	twit 			= require('twit'),
	keys 			= require('./.keys'),
	xml2js 			= require('xml2js');


/* App Settings */
app.use( express.cookieParser('thissecretrocks') );
app.use( express.session( {
	secret: 'thissecretrocks',
	key: 'express.sid',
	store: sessionStore
}));
app.use( app.router );
app.use( express.errorHandler( { dumpExceptions: true, showStack: true } ) );
app.use( express.static(__dirname+'/public'));

io.set('log level', 1); // reduce logging

var oa = new oauth(
	"https://api.twitter.com/oauth/request_token",
	"https://api.twitter.com/oauth/access_token",
	keys.twitterConsumerKey,
	keys.twitterConsumerSecret,
	"1.0",
	"http://tubewithme.com/auth/twitter/callback",
	"HMAC-SHA1"
);

var loginCheck = function( req, res, next ) {
	if( req.session.oauth ) {
		// already authed. skip
		res.redirect('/');
	} else {
		next();
	}
}

// Twitter auth route
app.get('/auth/twitter', function(req, res) {
	oa.getOAuthRequestToken( function(error, oauth_token, oauth_token_secret, results) {
		if(error) {
			console.log(error);
			res.send('yeah no. didnt work');
		} else {
			req.session.oauth = {};
			req.session.oauth.token = oauth_token;
			req.session.oauth.token_secret = oauth_token_secret;
			res.redirect('https://twitter.com/oauth/authenticate?oauth_token='+oauth_token);
		}
	});
});

app.get('/auth/twitter/callback', function(req, res, next) {
	if( req.session.oauth ) {
		req.session.oauth.verifier = req.query.oauth_verifier;
		var oauth = req.session.oauth;

		oa.getOAuthAccessToken( oauth.token, oauth.token_secret, oauth.verifier, function(error, oauth_access_token, oauth_access_token_secret, results) {
			if( error ) {
				console.log('error');
				res.send('something broke');
			} else {
				req.session.oauth.access_token = oauth_access_token;
				req.session.oauth.access_token_secret = oauth_access_token_secret;
				req.session.user = results;

				var Twitter = new twit({
					consumer_key: keys.twitterConsumerKey,
					consumer_secret: keys.twitterConsumerSecret,
					access_token: req.session.oauth.access_token,
					access_token_secret: req.session.oauth.access_token_secret
				});

				Twitter.get('account/verify_credentials', function(err, reply) {
					var uid = reply['id_str'];

					db.get.userHash(uid, function(err, user) {
						/* 
							if user doesn't exist, grab the user object from twitter and save the parts
							we want to keep in the user object. Also add a few user properties to the
							session user information
						*/

						//console.log( req.session.user );
						req.session.user.name = reply['name'];
						req.session.user.profile_image = reply['profile_image_url'];
						// console.log( req.session.user );

						req.session.touch().save();

						if( user === null ) {
							var userObj = {
								"uid": reply['id_str'],
								"name": reply['name'],
								"screen_name": reply['screen_name'],
								"profile_image": reply['profile_image_url']
							};
							db.save.userSetAdd(uid);
							db.save.userHashSet(uid, userObj);
						}

						res.redirect("/auth/twitter");
					});
				});
			}
		});
	} else {
		next( new Error("You're not supposed to be here") );
	}
});

// Route all /t/xxxxxxxxx requests to home page
app.get('/t/:tubeid', function(req, res) {
	var tubeid = req.params.tubeid;
	res.sendfile('./public/');
});

var Session = require('connect').middleware.session.Session;

// Configure socket.io
io.configure( function() {

	// make the socket.io connection auth and fetch the cookie from dataStore based on connection sid
	io.set('authorization', function setAuth(data, callback) {
		
		//console.log('trying to auth on cookie');
		//console.log('handshakeData.headers');

		if( !data.headers.cookie ) return callback('socket.io: no found cookie.', false);

		var signedCookies = cookie.parse(data.headers.cookie);
		data.cookies = require('express/node_modules/connect/lib/utils').parseSignedCookies(signedCookies, 'thissecretrocks');
		data.sessionStore = sessionStore;

		sessionStore.get(data.cookies['express.sid'], function(err, session) {
			if( err || !session ) return callback('socket.io: no found session.', false);
			data.session = session;
		});

		callback(null, true);
	});



});

io.sockets.on('connection', function(socket) {

	var hs = socket.handshake;

	//console.log('socket.io connection!');
	
	/* user checks if logged in. If so he'll receive his basis user info for display */
	socket.on('checkLogin', function(data) {
		//console.log('checkingLogin');
		socket.emit( 'receiveLogin', hs.session.user || false );
	});

	socket.on('updateUserPlayerStatus', function(data) {
		//console.log( JSON.stringify(data) );
		io.sockets.in(data.room).emit('userUpdates', data );
	});

	/* generate a new room, join it and return it to the user/creator */
	socket.on('createTubeRoom', function(vid) {

		
		/* Generate Random Room Name */
		var roomId = "";
	    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	    for( var i=0; i < 15; i++ )
	        roomId += possible.charAt(Math.floor(Math.random() * possible.length));

	    // Join room
	    socket.join( roomId );
	    socket.room = roomId;


	    // Send room ID back to client.. confirmation that it happened??
		socket.emit( 'newRoomId', roomId );

		// REDIS: add user to room
		db.save.tubeRoomSetAddUser(roomId, hs.session.user.user_id);
		
		// REDIS: set room video
		db.save.tubeRoomSetVideo( roomId, vid );

		/* 
			Broadcast to all members the vid of the new video
			This may be unnecessary since this is requestRoom
			part and there is no one in the room yet to receive
			the broadcasted information..
		*/
		socket.broadcast.to(roomId).emit('updateRoomVideo', vid );

		/*
			For the sake of keeping things consistent in the way user
			is created in the front end, i'll fetch myself and broadcast
			my user hash to myself
			REDIS: get user
		*/
		db.get.userHash( hs.session.user.user_id, function( err, user ) {
			socket.emit( 'roomUser', user );
			/* logging */
			console.log( user.name + ' created room: ' + roomId );
		});

	});

	/* join room */
	socket.on('joinRoom', function(roomId) {

		socket.join( roomId );
		socket.room = roomId;
		socket.emit('roomJoined', roomId);

		// REDIS: add user to room
		db.save.tubeRoomSetAddUser(roomId, hs.session.user.user_id);

		/*
			Get all users in the room and loop through them. 
			Emit each result to the user
		*/
		db.get.tubeRoomGetMembers(roomId, function(err, members) {

			//console.log('Contents of set for room: ' + roomId );
			//console.log('typeof members: ' + typeof members);
			//console.log( members );

			if(!members) {
				members = [];
			}

			for( var i=0; i<members.length; i++ ) {
				db.get.userHash( members[i], function( err, user ) {
					socket.emit( 'roomUser', user );
				});
			}
			
		});

		// Broadcast to everyone else that I joined
		db.get.userHash( hs.session.user.user_id, function( err, user ) {
			socket.broadcast.to(roomId).emit('roomUser', user );
			console.log( user.name + ' joined room: ' + roomId );
		});

		// Retrieve current video in the room
		db.get.tubeRoomVideo( roomId, function( err, vid ) {
			socket.emit( 'updateRoomVideo', vid );
		});

	});

	socket.on('setRoomVid', function( data ) {
		//console.log('setRoomVid data:' + data );
		console.log(data.roomId + ' - ' + data.vid );
		db.save.tubeRoomSetVideo( data.roomId, data.vid );
		io.sockets.in(data.roomId).emit('updateRoomVideo', data.vid );
		console.log( data.roomId + ' switched to video: ' + data.vid );
	});

	socket.on('disconnect', function() {
		if( typeof socket.room != "undefined" ) {
			db.remove.userFromRoom( hs.session.user.user_id, socket.room );
			socket.broadcast.to(socket.roomId).emit('userDisconnected', hs.session.user.user_id );
			db.get.userHash( hs.session.user.user_id, function( err, user ) {
				console.log( user.name + ' disconnected.' );
			});
		}
	});

	// Perform youtube search for user
	socket.on('searchYoutube', function(searchInfo) {

		var searchParams = ( searchInfo.keywords ? 'q=' + searchInfo.keywords : '');
			searchParams += ( searchInfo.startIndex ? '&start-index=' + searchInfo.startIndex : '');
			searchParams += ( searchInfo.maxResults ? '&max-results=' + searchInfo.maxResults : '&max-results=10');
			searchParams += '&v=2';

		console.log( searchParams );

		var options = {
			host: 'gdata.youtube.com',
			path: '/feeds/api/videos?' + searchParams,
			method: 'GET'
		};

		console.log( options );

		var searchCallback = function( response ) {
			var str = '';

			response.on('data', function( data ) {
				str += data;
			});

			response.on('end', function() {
				socket.emit('youtubeSearchResults', str );
			});

		};
		http.request( options, searchCallback).end();
	});

	// Add video to playlist
	socket.on('addVideoRoomPlaylist', function(data) {

		db.save.roomPlaylistSet(data.roomId, data.vid);
		db.save.videoHashSet( data.vid, data);
		io.sockets.in(data.roomId).emit('playListVideo', data );

	});

	// Return room playlist
	socket.on('getRoomPlaylist', function(roomId) {
		console.log('fetching playlist');
		db.get.tubeRoomPlaylist( roomId, function( err, playlist ) {

			if( err ) { console.log( err ) }

			if(!playlist) {
				playlist = [];
			}

			for( var i=0; i < playlist.length; i++ ) {
				db.get.videoHashSet( playlist[i], function( err, video ) {
					if( err ) console.log( err );
					socket.emit( 'playListVideo', video );
					console.log('emitting video', video);
				});
			}

		});
	});
});

server.listen(80);