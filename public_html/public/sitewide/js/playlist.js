/* Playlist.js */

Playlist = function ( parent ) {

	this.parent = parent;
	this.container = null;
	this.itemsContainer = null;
	this.items = {};

}


Playlist.prototype.init = function() {
	console.log( this.parent.containers['playlist'] );
	this.container = this.parent.containers['playlist'];
	this.itemsContainer = this.container.find('ul');
}

Playlist.prototype.addVideo = function( videoData ) {

	var video = {
		vid: videoData.vid,
		img: videoData.img,
		title: videoData.title
	};

	var li = $('<li class="clearfix"><img class="thumb" /><span class="title" /></li>');
	li.attr('vid', video.vid);
	li.find('img').attr('src', video.img);
	li.find('.title').html( video.title.substring(0, 50) );

	this.itemsContainer.append( li );

}