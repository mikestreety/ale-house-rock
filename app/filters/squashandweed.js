module.exports = function (text) {

	var content = new String(text);

	// // all lower case, please
    // content = content.toLowerCase();

    // // remove all html elements and new lines
    // var re = /(&lt;.*?&gt;)/gi;
    // var plain = unescape(content.replace(re, ''));

	// // remove short and less meaningful words
	// content = plain.replace(/\b(\.|\,|the|a|an|and|am|you|I|to|if|of|off|me|my|on|in|it|is|at|as|we|do|be|has|but|was|so|no|not|or|up|for)\b/gi, '');
	// //remove newlines, and punctuation
	// content = content.replace(/\.|\,|\?|-|—|\n/g, '');
	// //remove repeated spaces
	// content = content.replace(/[ ]{2,}/g, ' ');

	// //remove newlines, and punctuation
	// content = content.replace(/\\/gi, ' ');
	// content = content.replace(/\(\)/gi, ' ');
	// content = content.replace(/::/gi, ' ');
	// content = content.replace(/\t/gi, ' ');
	// content = content.replace(/[ ]{2,}/g, ' ');

	return content;
}
