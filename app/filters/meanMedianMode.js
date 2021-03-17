module.exports = function (array) {
	return {
		mean: getMean(array),
		median: getMedian(array),
		mode: getMode(array)
	}
}

function getMean(array) {
	var sum = 0;
	array.forEach( num => {
		sum += num;
	});
	var mean = sum / array.length;
	return Math.round(mean * 100) / 100;
}

function getMedian(array) {
	array.sort(function (a, b) {
		return a - b;
	});
	var median;

	if(array.length % 2 !== 0) {
		median = array[Math.floor(array.length / 2)];
	} else {
		var mid1 = array[(array.length / 2) -1 ];
		var mid2 = array[array.length / 2 ];
		median = (mid1 + mid2) /2;
	}
	return median;
}

function getMode(array) {
	var modeObj = {};
	array.forEach( num => {
		if(!modeObj[num]) modeObj[num] = 0;
		modeObj[num]++;
	});

	var maxFreq = 0;
	var mode = [];

	for(var num in modeObj) {
		if(modeObj[num] > maxFreq) {
			modes = [num];
			maxFreq = modeObj[num];
		}
		else if(modeObj[num] === maxFreq) modes.push(num);
	}

	if(modes.length === Object.keys(modeObj).length) modes = [];

	return modes;
}
