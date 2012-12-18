var redis = require('redis'),
	client = redis.createClient();

// redis error handler
client.on('error', function(err){
	console.log('Error' + err);
});

// on connect
client.on('connect', function redisConnect() {
	console.log('module:redis | connected');
});


// Save functions
exports.save = {
	/* Users */
	userSetAdd: function(uid) {
		client.sadd("users", "user:" + uid, redis.print);
		//console.log('write user:uid to set');
	},
	userHashSet: function(uid, userData) {
		client.hmset("user:"+uid, userData, redis.print);
		//console.log('write userHash set');
	},
	/* tubewithme sessions */
	tubeRoomSetAddUser: function(roomId, uid) {
		//console.log('typeof uid: ' + typeof uid);
		//console.log('add to room : ' + roomId + ' user: ' + uid);
		client.sadd("tuberoom:" + roomId, uid, redis.print);
		//console.log('join room');
	},
	tubeRoomSetVideo: function(roomId, vid) {
		client.set("tuberoom:" + roomId + ':vid', vid);
	},
	roomPlaylistSet: function(roomId, vid) {
		client.sadd("tuberoom:" + roomId + ':playlist', vid);
	},
	videoHashSet: function(vid, vidData) {
		client.hmset("video:" + vid, vidData);
	}
};

exports.get = {
	userHash: function(uid, callback) {
		client.hgetall("user:" + uid, callback);
	},
	tubeRoomGetMembers: function(roomId, callback) {
		client.smembers("tuberoom:" + roomId, callback);
	},
	tubeRoomVideo: function(roomId, callback) {
		client.get("tuberoom:" + roomId + ':vid', callback);
	},
	tubeRoomPlaylist: function(roomId, callback) {
		client.smembers("tuberoom:" + roomId + ":playlist", callback);
	},
	videoHashSet: function(vid, callback) {
		client.hgetall("video:" + vid, callback);
	}
};

exports.remove = {
	userFromRoom: function( uid, roomId ) {
		client.srem("tuberoom:" + roomId, uid);
	}
}