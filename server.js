var express = require('express');
var app = express();

var port = process.env.PORT || 3696;
var https = require('https');
var http = require('http');
var querystring = require('querystring');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser')
var dateFormat = require('dateformat');

var mysql = require('mysql');
var fs = require('fs');
var cors = require('cors');

var parseUrl = function() {
	if (!process.env.DATABASE_URL) {
		return null;
	}

	var matches = process.env.DATABASE_URL.match(/^(mysql:\/\/)(.*):(.*)@([a-z0-9_\-\.]+)(:([0-9]+))?\/([a-z0-9\._]+)(\?sslca=(.*))?$/i);

	var db = {
		host: matches[4],
		user: matches[2],
		password: matches[3],
		database: matches[7],
		port: matches[6]
	};
	if (matches[9] == 'rds') {
		db.ssl = 'Amazon RDS';
	}

	return db;
};

var db = parseUrl() || {
	host     : 'localhost',
	user     : 'root',
	password : 'root',
	database : 'crunchbutton',
	port     : 3306
};

var corsOptions = {
	origin: 'https://crunchbutton.com'
};


var options = {
	key: fs.readFileSync('wild.sha-2.crunchbutton.com.key.private'),
	cert: fs.readFileSync('wild.sha-2.crunchbutton.com.crt')
};

var pool = mysql.createPool(db);

http.createServer(app).listen(port, function() {
	console.log('HTTP listening at port %d', port);
});

/*
// only for local dev
https.createServer(options, app).listen(443, function() {
	console.log('HTTP listening at port %d', 443);
});
*/

app.use(bodyParser.json());
app.use(cookieParser());

app.post('/api/events', cors(corsOptions), function (req, res) {

	var data = {
		category: req.query.category,
		action: req.query.action,
		label: req.query.label,
		id_community: req.query.community,
		json_data: JSON.stringify(req.query.data),
		ts: dateFormat(new Date, 'yyyy-mm-dd HH:MM:ss'),
		user_agent: req.headers['user-agent'],
		ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
		id_session: req.cookies.PHPSESSID,
		id_user: null // need this!
	};

	if (!data.category || !data.action) {
		res.sendStatus(400);
		return;
	}

	var insert = function(id_user) {
		data.id_user = id_user;
		pool.getConnection(function(err, connection) {
			if (err) {
				console.log(err);
				return;
			}

			var sql = 'insert into analytics_event set ?';
			connection.query(sql, data, function(err, results) {
				connection.release();
				if (err) {
					console.log(err);
					return;
				}
			});
		});
	};

	pool.getConnection(function(err, connection) {
		if (err) {
			console.log(err);
			return;
		}

		var sql = 'select * from session where id_session = ?';
		connection.query(sql, [req.cookies.PHPSESSID], function(err, results) {
			connection.release();
			if (err) {
				console.log(err);
				return;
			}
			console.log(results);
			insert(results.id_user);
		});
	});

	res.send('{"status":"success"}');
});

app.post('/api/log', cors(corsOptions), function (req, res) {


	var data = {
		level: 'debug',
		type: req.query.type,
		date: dateFormat(new Date, 'yyyy-mm-dd HH:MM:ss'),
		data: JSON.stringify(req.query.data)
	};

	// clean the type name
	if( data.type ){
		data.type = data.type.replace(/[^a-z\d _]/g, '');
		data.type = data.type.replace(/[ _]/g, '-');
	} else {
		data.type = 'unkown';
	}


	var start = function( data ){

		// insert log
		var insertLog = function( data ){

			pool.getConnection(function(err, connection) {
				if (err) {
					console.log(err);
					return;
				}
				delete( data.type );
				var sql = 'insert into log set ?';
				connection.query( sql, data, function(err, results) {
					connection.release();
					if (err) {
						console.log(err);
						return;
					}
				});
			});
		}

		// if the type doesnt exist, create one
		var saveType = function( data ){
			var type = { type: data.type };

			pool.getConnection(function(err, connection) {
				if (err) {
					console.log(err);
					return;
				}

				var sql = 'insert into log_type set ?';
				connection.query(sql, type, function(err, results) {
					connection.release();
					if (err) {
						console.log(err);
						return true;
					}
					getType( data );
				});
			});
		};

		var getType = function( data ){
			pool.getConnection(function(err, connection) {
				if (err) {
					console.log(err);
					return;
				}

				var sql = 'select * from log_type where type = ?';
				connection.query(sql, [data.type], function(err, results) {
					connection.release();
					if (err) {
						console.log(err);
						return;
					}

					if( results && results[0] && results[0].id_log_type ){
						data.id_log_type = results[0].id_log_type;
						insertLog( data );
					} else {
						saveType( data );
					}

				});
			});
		}

		// get the type and save it
		getType( data );

	}

	// start stuff
	start( data );

	res.send('{"status":"saved"}');
});

app.all('*', function (req, res) {
	res.sendStatus(501);
});
