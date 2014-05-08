var domain = require('domain');
var net = require('net');
var once = require('once');
var async = require('async');


var askers = [
	require('./lib/askers/1_7'),
	require('./lib/askers/1_6'),
	require('./lib/askers/1_4')
];
var askerLookup = {
	'1_7': askers[0],
	'1_6': askers[1],
	'1_4': askers[2]
};

var parsers = [
	require('./lib/parsers/1_7'),
	require('./lib/parsers/1_6'),
	require('./lib/parsers/1_4'),
	require('./lib/parsers/pre_1_4')
];


var TRY_LIMIT = 3;
var TIMEOUT = 10 * 1000;


exports.getStatus = function(addr, port, opts, cb) {
	if(typeof opts === 'function') {
		cb = opts;
		opts = {};
	}

	cb = once(cb);
	addr = addr.trim();

	var a = askers.slice(), lastError;
	if(opts.asker) {
		a = [askerLookup[opts.asker]];
	}

	async.until(function() {
		return a.length === 0;
	}, function(cb) {
		attempt(a.pop(), addr, port, function(err, info) {
			if(err) {
				lastError = err;
			}

			cb(info);
		});
	}, function(info) {
		if(info) {
			cb(null, info);
		} else {
			cb(new Error('Unable to get server info: ' + lastError.message));
		}
	});
}


function attempt(asker, addr, port, cb) {
	var t = setTimeout(function() {
		if(conn) {
			conn.destroy();
		}

		cb(new Error('Timed out'));
	}, TIMEOUT);

	var conn = net.connect(port, addr);
	conn.setNoDelay(true);

	conn.on('error', function(err) {
		clearTimeout(t);

		conn.destroy();

		errorHandler(cb, err);
	});

	conn.once('data', function(data) {
		clearTimeout(t);

		conn.end();
		conn.destroy();

		var result;
		parsers.some(function(parser) {
			try {
				result = parser(data);
				return true;
			} catch(e) {
				return false;
			}
		});

		if(!result) {
			cb(new Error('Unable to parse server response'));
			return;
		}

		cb(null, result);
	});

	asker(conn, addr, port);
}


function errorHandler(cb, err) {
	if(err.name === 'RangeError') {
		cb(new Error('Invalid port: ' + port));
		return;
	}

	switch(err.code) {
	case 'ENOENT':
		cb(new Error('Invalid port value'));
		return;

	case 'ENOTFOUND':
		cb(new Error('Unable to resolve domain'));
		return;

	case 'ETIMEDOUT':
		cb(new Error('Connection timed out'));
		return;

	case 'ECONNREFUSED':
		cb(new Error('Connection refused'));
		return;

	case 'ECONNRESET':
		cb(new Error('Connection reset by server'));
		return;

	case undefined:
		cb(err);
		return;
	}

	throw err;
}
