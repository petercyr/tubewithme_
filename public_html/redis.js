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
		console.log('write user:uid to set');
	},
	userHashSet: function(uid, userData) {
		client.hmset("user:"+uid, userData, redis.print);
		console.log('write userHash set');
	},
	/* tubewithme sessions */
	tubeRoomSetAddUser: function(id, roomData) {
		console.log('tubeRoomSetAddUser id: ' + id + ' roomData: ' + roomData);
		client.sadd("tuberoom:" + id, roomData, redis.print);
		console.log('join room');
	},
	tubeRoomSetVideo: function(room, video) {
		client.set("tuberoom:" + room, video);
	}
};

exports.get = {
	userHash: function(uid, callback) {
		client.hgetall("user:" + uid, callback);
	},
	tubeRoomGetMembers: function(roomId, callback) {
		client.smembers("tuberoom:" + roomId, callback);
	},
	tubeRoomVideo: function(room, callback) {
		client.get("tuberoom:"+room, callback);
	}
};