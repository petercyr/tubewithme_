var express 		= require('express'),
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
	twit 			= require('twit');


var _twitterConsumerKey = "cuCyJXs7if6BrR5rUjg";
var _twitterConsumerSecret = "OgccVC8LnD0EIKcOCKOjdr4FePj8ALdlm78QocQTww";

app.configure('development', function() {
	// app.use( express.logger('dev') );
	app.use( express.cookieParser('thissecretrocks') );
	app.use( express.session( {
		secret: 'thissecretrocks',
		key: 'express.sid',
		store: sessionStore
	}));
	app.use( app.router );
	app.use( express.errorHandler( { dumpExceptions: true, showStack: true } ) );
	app.use( express.static(__dirname+'/public'));
});

var oa = new oauth(
	"https://api.twitter.com/oauth/request_token",
	"https://api.twitter.com/oauth/access_token",
	"cuCyJXs7if6BrR5rUjg",
	"OgccVC8LnD0EIKcOCKOjdr4FePj8ALdlm78QocQTww",
	"1.0",
	"http://tubewithme.local:8080/auth/twitter/callback",
	"HMAC-SHA1"
);

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
					consumer_key: _twitterConsumerKey,
					consumer_secret: _twitterConsumerSecret,
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
						console.log( req.session.user );

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

						res.redirect("/");
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
		
		console.log('trying to auth on cookie');
		console.log('handshakeData.headers');

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

	console.log('socket.io connection!');
	
	/* user checks if logged in. If so he'll receive his basis user info for display */
	socket.on('checkLogin', function(data) {
		console.log('checkingLogin');
		socket.emit( 'receiveLogin', hs.session.user || false );
	});

	socket.on('updateUserPlayerStatus', function(data) {
		console.log( data );
		socket.broadcast.to(data.room).emit('userUpdates', data );
	});

	/* generate a new room, join it and return it to the user/creator */
	socket.on('requestRoomId', function() {

		
		/* Generate Random Room Name */
		var room = "";
	    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	    for( var i=0; i < 15; i++ )
	        room += possible.charAt(Math.floor(Math.random() * possible.length));

	    socket.set('room', room, function() {
	    	console.log( 'room ' + room + ' saved');
	    });

	    // Join room
	    socket.join( room );

	    // Send room ID back to client
		socket.emit( 'newRoomId', room );

		// Add user to room
		db.save.tubeRoomSetAddUser(room, hs.session.user.user_id);
		console.log(room, hs.session.user.user_id);
	});

	/* join room */
	socket.on('joinRoom', function(room) {
		// join room
		console.log( hs.session.user.name + ' joined ' + room );

		// add self to room list
		console.log('adding self to tubeRoomSetAddUser');
		db.save.tubeRoomSetAddUser(room, hs.session.user.user_id);
		console.log('added?');

		/*
			bad attempt at redis... fetch an array of user IDs
			in a room and for each one do another request for its hash.
			broadcast each user independently...
		*/
		db.get.tubeRoomGetMembers(room, function(err, members) {

			console.log('Contents of set for room: ' + room );
			
			console.log( members );
			for( var i=0; i<members.length; i++ ) {
				db.get.userHash( members[i], function( err, user ) {
					socket.emit( 'roomUser', user );
				});
			}
			
		});
		socket.join( room );
		socket.emit('roomJoined', room);
	});

	socket.on('setRoomVid', function( data ) {
		console.log('setRoomVid data:' + data );
		db.save.tubeRoomSetVideo( data.roomId, data.vid );
		socket.broadcast.to(data.roomId).emit('updateRoomVideo', data.vid );

	});

});

server.listen(8080);