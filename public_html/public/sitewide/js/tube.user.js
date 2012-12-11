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
		self.container = self.parent.containers.users.find('.' + self.uid);
		self.progress = self.container.find('.expand');
	});

};

Tube.User.prototype.updateUserStatus = function( userData ) {

	var self = this;

	/* width of a progress bar */
	var barWidth = 240;

	self.progress.css('width', (userData.playerStatus.videoCurrentTime / userData.playerStatus.videoDuration * barWidth) + 'px' );

};