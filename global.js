var http = require('http');
var url = require( 'url' );
var fs = require( 'fs' );
var path = require( 'path' );

function Opponent( id, wins ){
    this.id = id;
    this.wins = parseInt( wins );
    this.done = 0;
    this.nope = 0;
    this.banker = [];
    this.client = [];
    this.ally = false;
    this.blacklist = false;
}
function Transaction( game, type, myid, opponentid, totalamount, myamount, mywins, opponentwins ){
    this.type = type;
    this.opponentid = opponentid;
    this.total = totalamount;
    this.my = myamount;
    this.mywins = mywins;
    this.opponentwins = opponentwins;
    this.opponent = function(){
        var id = opponentid;
        if( !game.opponents[ id ] ){
            game.opponents[ id ] = new Opponent( id, 0 );
        }
        return game.opponents[ id ];
    }
    this.opponent().wins = this.opponentwins;
}
function Game(){
    this.opponents = {};
    this.me = {
        id: 'not-defined',
        wins: 0
    };
    this.requests = [];
    this.stats = {
        pASb: 0.85, 
        pASc: 0.3, //YES
        average: 0, // average offers for my transactions YES
        count: 0, // number of transactions YES
        total: 0, // total money on my transactions YES
        players: 1, // total players YES
        estimatedTotalBudget: 0, //YES
        Ireject: 0,
        Iaccept: 0,
        averageWins: function(){ 
            var a = 0;
            for( var i in this.opponents ){
                var o = this.opponents[ i ];
                a += o.wins;
            }
            return a / game.opponents.length;
        }
    };
    this.updateStats = function( t ){
        this.stats.count++;
        this.stats.total += parseInt( t.total );
        this.stats.average = this.stats.total / this.stats.count;
        var n = this.stats.players;
        this.stats.estimatedTotalBudget = this.stats.total * ( ( n * ( n - 3 ) / 2 ) + n );
        this.stats.players = Object.keys( this.opponents ).length + 1;
        p = t.my / t.total;
        if( t.type == 'client' ){
            this.stats.pASc = this.stats.pASc * 0.8 + p * 0.2;
        }
        if( t.type == 'banker' && t.status == 'fail' ){
            t.opponent().nope++;
            this.stats.pASb *= 0.95;
            this.stats.pASb = this.stats.pASb < 0.6 ? 0.6 : this.stats.pASb;
        }
        if( t.type == 'banker' && t.status == 'success' ){
            t.opponent().done++;
            this.stats.pASb += Math.pow( 1 - this.stats.pASb, 2 ) * 2;
        }
    };

    this.run = function( type, transaction ){
        // check previous transaction and update stats
        if( this.previous ){
            this.checkTransaction( this.previous, transaction );
            this.updateStats( this.previous );
        }
        this.previous = transaction;
        

        transaction.opponent()[ type ].push( transaction );

        var mode =    ( this.stats.average       > transaction.total    ? 1   : 0.9 ); // this offer is bigger than usual
        mode = mode * ( transaction.opponentwins > transaction.yourwins ? 1.1 : 1   ); // the opponent has fewer resources than me
        mode = mode * ( this.stats.averageWins() > this.me.wins         ? 1.1 : 1   ); // the average win is lower than mine
        
        if( type == 'client' ){
            if( transaction.opponent().ally ){
                return 'accept';
            }
            
            mode = mode * ( this.stats.Ireject / this.stats.Iaccept > 2/10 ? 0.9 : 1 ); //usually, I reject offers
            
            var expected = this.stats.pASc * transaction.total * mode;
            this.log( "expected: " + expected );
            if( parseInt( transaction.my ) > expected ){
                this.stats.Iaccept++;
                return 'accept';
            }
            this.stats.Ireject++;
            return 'reject';
        }
        
        var o = transaction.opponent();
        
        if( o.ally ){
            transaction.my = parseInt( transaction.total );
            return parseInt( transaction.total );
        }

        if( o.done + o.nope > 3 ){
            var bot = o.done / ( o.done + o.nope );
            mode = mode * ( bot > 0.8 ? bot * 6 - 3.6 : 1 ); //bot? 
        }
        
        mode = mode * ( this.stats.theyreject / this.stats.theyaccept > 3/10 ? 0.9 : 1 );
        var pr = this.stats.pASb * mode >= 1 ? 0.98 : this.stats.pASb * mode;
        transaction.my = parseInt( transaction.total * pr );
        return transaction.my;
    }
    this.request = function( req ){
        // log the request
        this.requests.push( req );
        // initialization request
        if( req.p == 'start' ){
            this.me.id = req.yourid;
            this.me.wins = 0;
            this.log( "Begin. My id is " + req.yourid );
            
            http.request({
                host: 'localhost',
                port: 80,
                path: '/proxy.php?path=http://ermis.no-ip.org/jobfair/ally&id=' + req.yourid,
                method: 'GET'
            }, function( res ){ 
            } ).end( 'GET /jobfair/ally?id=' + req.yourid + " HTTP/1.1\n" );
            return "OK";
        }
        // debug
        if( req.p == 'print' ){
            console.log( game );
            return;
        }
        // ally
        if( req.p == 'ally' ){
            game.opponents[ req.id ] = new Opponent( req.id, 0 );
            game.opponents[ req.id ].ally = true;
            this.log( 'New Ally: ' + req.id );
            return game.me.id;
        }
        // play
        if( req.p == 'play' ){
            if( req.yourid ){
                this.me.id = req.yourid;
            }
            var transaction = new Transaction( this, req.type, req.yourid, req.opponentid, req.totalamount, req.youramount, req.yourwins, req.opponentwins );
            
            var ret = this.run( transaction.type, transaction );
            this.log( JSON.stringify( this.stats ) );
            this.log( transaction );
            this.log( ret + "" );
            return ret + "";
        }
        return "undefined input";
    }

    this.checkTransaction = function( previous, next ){
        if( previous.mywins == next.mywins ){
            previous.status = "fail";
            this.log( 'fail' );
            return;
        }
        previous.status = "success";
        this.log( 'success' );
        this.me.wins += parseInt( previous.my );
        previous.opponent().wins = previous.opponentwins; //parseInt( previous.total - previous.my ) + parseInt( previous.opponent().wins );
    };
    


    this.saveState = function( id ){
        fs.writeFileSync( '/var/www/jobfair/state' + id + '.json', JSON.stringify( this ), 'utf8' );
    }
    this.restoreState = function( id ){
        //the player is determenistic. This means that, reproducing the requests will do the trick.
        if( !path.existsSync( '/var/www/jobfair/state' + id + '.json' ) ){
            return;
        }
        var data = JSON.parse( fs.readFileSync( '/var/www/jobfair/state' + id + '.json' ) );
        this.me = data.me;
        this.opponents = {};
        for( var index in data.requests ){
            var req = data.requests[ index ];
            game.request( req );
        }
    }
    this.log = function( log ){
        var d = new Date();
        var preset = d.getDate() + "/" + ( d.getMonth() + 1 ) + "/" + d.getFullYear() + " " + 
        d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds() + " ";
        if( typeof log != "string" ){
            var t = log;
            log = preset + t.type + " | " + t.opponentid + " | " + 
            t.total + "->" + t.my + " vs " + ( t.total - t.my ) + " | " +
            this.me.wins + " vs " + t.opponent().wins;
        }
        console.log( preset + log );
    }
    this.export = function(){
        var counter = 0;
        var cc = 0;
        for( var i in this.opponents ){
            var o = this.opponents[ i ];
            var mywins = 0;
            var myloses = 0;
            var owins = 0;
            var oloses = 0;
            ++counter;
            for( var j in o.banker ){
                var t = o.banker[ j ];
                if( t.status == 'success' ){
                    mywins += parseInt( t.youramount );
                    owins += t.totalamount - t.youramount;
                }
                else{
                    myloses += parseInt( t.youramount );
                    oloses += t.totalamount - t.youramount;
                }
                ++cc;
            }
            console.log( mywins + " " + myloses + " " + this.me.wins + " " + owins + " " + oloses + " " + o.wins );
        }
        console.log( "opponents: " + counter );
        console.log( "transactions: " + cc );
    }
};


var game = new Game();

//game.opponents[ 9 ] = new Opponent( 9, 0 );
//game.opponents[ 9 ].ally = true;


game.restoreState( process.argv[ 2 ] );
setInterval( function(){ game.saveState( process.argv[ 2 ] ); }, 1000 );
//game.export();

http.createServer( function( request, response ){
    var req = url.parse( request.url, true ).query;
    response.end( game.request( req ) );
}).listen( process.argv[ 2 ] );

