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
var fs = require('fs');


var options = {
	key: fs.readFileSync('wild.sha-2.crunchbutton.com.key.private'),
	cert: fs.readFileSync('wild.sha-2.crunchbutton.com.crt')
};

var pool = mysql.createPool({
	host     : 'localhost',
	user     : 'root',
	password : 'root',
	database : 'crunchbutton',
	port     : 3306
});

http.createServer(app).listen(8080);
https.createServer(options, app).listen(443);

app.use(bodyParser.json());
app.use(cookieParser());

app.post('/api/events', function (req, res) {

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

app.post('/api/log', function (req, res) {
	var data = {
		level: 'debug',
		type: req.query.type,
		date: dateFormat(new Date, 'yyyy-mm-dd HH:MM:ss'),
		data: JSON.stringify(req.query.data)
	};

	pool.getConnection(function(err, connection) {
		if (err) {
			console.log(err);
			return;
		}

		var sql = 'insert into log set ?';
		connection.query(sql, data, function(err, results) {
			connection.release();
			if (err) {
				console.log(err);
				return;
			}
		});
	});

	res.send('{"status":"saved"}');
});

app.all('*', function (req, res) {
	res.sendStatus(501);
});
