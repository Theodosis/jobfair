var http = require('http');
var url = require( 'url' );
var fs = require( 'fs' );
var path = require( 'path' );

var hosts = {
    1: {
        host: 'ted.kamibu.com',
        port: 80,
        defpath: '/proxy.php?path=http://ermis.no-ip.org/jobfair/play&',
        method: 'GET',
    },
    2: {
        host: 'localhost',
        port: 80,
        defpath: '/jobfair/play?',
        method: 'GET'
    }
};

http.request({
    host: 'localhost',
    port: 80,
    path: '/jobfair/start?yourid=2',
    method: 'get'
}, function( res ){
    res.setEncoding( 'utf8' );
    res.on( 'data', function( c ){
        console.log( "2: " + c );
    });
}).end();

var obj = hosts[ 1 ];
obj.path = '/proxy.php?path=http://ermis.no-ip.org/jobfair/start?yourid=1';
http.request( obj, function( res ){
    res.setEncoding( 'utf8' );
    res.on( 'data', function( c ){
        console.log( "1: " + c );
    } );
} ).end( "GET /jobfair/start?yourid=1 HTTP/1.1\n" );

var cash = {
    1: 0,
    2: 0 
};

var amount, id1, id2, res1, res2;
var ready = true;
setInterval( function(){
    if( !ready ){
        return;
    }
    ready = false;
    amount = parseInt( Math.random() * 200 ) + 100;
    
    if( Math.random() < 0.5 ){
        id1 = 1;
        id2 = 2;
    }
    else{
        id1 = 2;
        id2 = 1;
    }
    var op1 = hosts[ id1 ];
    op1.path = op1.defpath + 'type=banker&yourid=' + id1 + '&opponentid=' + id2 + '&totalamount=' + amount + 
                    '&yourwins=' + cash[id1] + '&opponentwins=' + cash[id2];
    console.log( id1 + ": " + op1.path );
    http.request( op1, function( res ){

        res.setEncoding( 'utf8' );
        res.on( 'data', function( c ){
            res1 = c;
            console.log( c );
            var op2 = hosts[ id2 ];
            op2.path = op2.defpath + 'type=client&yourid=' + id2 + '&opponentid=' + id1 + '&totalamount=' + amount + 
                        '&youramount=' + ( amount - c ) + '&yourwins=' + cash[id2] + '&opponentwins=' + cash[id1];
            console.log( id2 + ": " + op2.path );
            http.request( op2, function( res ){
                res.setEncoding( 'utf8' );
                res.on( 'data', function( c ){
                    console.log( c );
                    if( c == 'accept' || c == 'accept\n' ){
                        cash[ id1 ] += parseInt( res1 );
                        cash[ id2 ] += parseInt( amount ) - parseInt( res1 );
                    }
                    console.log( cash );
                    ready = true;
                } );
            } ).end( 'GET ' + op2.path + " HTTP/1.1\n" );
        } );
    } ).end( 'GET ' + op1.path + " HTTP/1.1\n" );
}, 5000 );
