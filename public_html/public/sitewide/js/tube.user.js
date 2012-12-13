Tube.User = function( userData, parent ) {

	/* Keep a pointer to the parent obj.. */
	this.parent = parent;

	/* Define default user variables */
	this.name = userData.name;
	this.screen_name = userData.screen_name;
	this.profile_image = userData.profile_image;
	this.uid = userData.uid;

	/* DOM container for simple access */
	this.container = null;
	this.progress = null;
	this.state = null;
	this.time = null;

	this.init();
};

Tube.User.prototype.init = function() {

	var self = this;

	/* render user template */
	$.get('/sitewide/html/user.html', function( template ) {
		
		/*
			put template html into a jQuery object for easy manipulation
		*/
		var template = jQuery(template);



		template.find('.pic').attr('src', self.profile_image);
		template.find('.name').html( self.name );
		template.addClass(self.uid);

		self.parent.containers.users.append( template );

		self.container = template;
		self.progress = template.find('.expand');
		self.state = template.find('.state');
		self.time = template.find('.time');
	});

};

Tube.User.prototype.updateUserStatus = function( userData ) {

	var self = this;

	/* width of a progress bar */
	var barWidth = 240;

	self.progress.css('width', (userData.playerStatus.videoCurrentTime / userData.playerStatus.videoDuration * barWidth) + 'px' );

	switch( userData.playerStatus.playerStatus ) {
		case -1: 	self.pause(); /*console.log( 'not started' );*/ break;
		case 0: 	self.pause(); /*console.log( 'ended' );*/ break;
		case 1: 	self.play(); /*console.log( 'playing' );*/  break;
		case 2: 	self.pause(); /*console.log( 'buffering or paused' );*/  break;
		case 3: 	self.pause(); /*console.log( 'buffering' );*/ break;
		case 5: 	self.pause(); /*console.log( 'queued' );*/ break;
	}

	self.time.html( rectime( Math.floor( userData.playerStatus.videoCurrentTime ) ) + '/' + rectime ( Math.floor( userData.playerStatus.videoDuration ) ) );
};

Tube.User.prototype.pause = function() {
	this.state.removeClass('playing').addClass('paused');
}

Tube.User.prototype.play = function() {
	this.state.removeClass('paused').addClass('playing');
}

