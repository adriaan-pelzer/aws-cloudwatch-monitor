const H = require ( 'highland' );
const R = require ( 'ramda' );
const aws = require ( 'aws-sdk' ), cw = new aws.CloudWatch (), sns = new aws.SNS ();

const log = R.compose ( console.log, R.partialRight ( JSON.stringify, [ null, 4 ] ) );

const streamAWS = R.curry ( ( service, command, options, callback ) => {
    service[command] ( options, callback );
} );

const nowInMilliSeconds = new Date ().valueOf ();
const aMinuteInMilliSeconds = 60 * 1000;
const aDayInMilliSeconds = 24 * 3600 * 1000;

const NameSpace = ( process.argv[2] !== '-' && process.argv[2] ) || 'AWS/ElastiCache';
const MetricName = ( process.argv[3] !== '-' && process.argv[3] ) || 'FreeableMemory';
const probedDays = ( process.argv[4] !== '-' && process.argv[4] ) || 7;
const snsTopic = ( process.argv[5] !== '-' && process.argv[5] ) || null;
const thresHold = ( process.argv[6] !== '-' && process.argv[6] ) || 30;

const limits = ( process.argv.length > 7 ) ? R.slice ( 7, Infinity, process.argv ) : [ 0 ];

H.wrapCallback ( streamAWS ( cw, 'listMetrics' ) )( {
    Namespace: NameSpace,
    MetricName: MetricName
} )
    .pluck ( 'Metrics' )
    .sequence ()
    .reject ( R.compose ( R.isEmpty, R.prop ( 'Dimensions' ) ) )
    .flatMap ( parms => {
        const StartTimeInMilliSeconds = ( nowInMilliSeconds - probedDays * aDayInMilliSeconds ) - aMinuteInMilliSeconds;
        const EndTimeInMilliSeconds = nowInMilliSeconds;

        return H ( [
            R.merge ( {
                StartTime: new Date ( StartTimeInMilliSeconds ).toJSON (),
                EndTime: new Date ( StartTimeInMilliSeconds + aMinuteInMilliSeconds ).toJSON (),
                Period: 60,
                Statistics: [
                    'Average'
                ]
            }, parms ),
            R.merge ( {
                StartTime: new Date ( EndTimeInMilliSeconds - aMinuteInMilliSeconds ).toJSON (),
                EndTime: new Date ( EndTimeInMilliSeconds ).toJSON (),
                Period: 60,
                Statistics: [
                    'Average'
                ]
            }, parms )
        ] )
            .map ( H.wrapCallback ( streamAWS ( cw, 'getMetricStatistics' ) ) )
            .parallel ( 2 )
            .collect ()
            .map ( resultPair => ( {
                TimesToLimit: R.map ( limit => R.merge ( limit, {
                    BelowThreshold: 0 <= limit.TimeToLimitInDays && limit.TimeToLimitInDays <= thresHold
                } ), R.map ( limit => ( {
                    Limit: limit,
                    TimeToLimitInDays: ( probedDays * ( resultPair[1].Datapoints[0].Average - limit ) ) / ( resultPair[0].Datapoints[0].Average - resultPair[1].Datapoints[0].Average )
                } ), limits ) ),
                Datapoints: [ resultPair[0].Datapoints[0].Average, resultPair[1].Datapoints[0].Average ]
            } ) )
            .map ( R.merge ( parms ) );
    } )
    .collect ()
    .flatMap ( resultSets => {
        const logs = R.map ( results => {
            return [ R.map ( Dimension => {
                    return [ Dimension.Name, Dimension.Value ].join ( '=' );
                }, results.Dimensions ).join ( ', ' ),
                R.map ( Limit => {
                    return R.concat (
                        [ Limit.Limit, Math.round ( Limit.TimeToLimitInDays ) ],
                        Limit.BelowThreshold ? [ '!!!' ] : []
                    ).join ( ':' );
                }, results.TimesToLimit ).join ( ', ' )
            ].join ( ' | ' );
        }, resultSets );

        const criticalLogs = R.filter ( log => {
            return log.match ( '!!!' );
        }, logs );

        if ( ! snsTopic || R.isEmpty ( criticalLogs ) ) {
            return H ( [ logs ] );
        }

        return H.wrapCallback ( streamAWS ( sns, 'publish' ) )( {
            Message: criticalLogs.join ( "\r\n" ),
            Subject: 'REDIS databases - days left',
            TopicArn: snsTopic
        } )
            .map ( R.always ( logs ) )
    } )
    .map ( R.sortBy ( R.identity ) )
    .errors ( R.unary ( console.error ) )
    .apply ( R.unary ( log ) );
