import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { fromUtf8 } from "@aws-sdk/util-utf8"

const region = "eu-west-1"
const docClient = new DynamoDBClient({ region: region });
const lambda = new LambdaClient({ region: region });
const limit = 1000;

interface functionEvent extends APIGatewayEvent {
    ScannedCount: number,
    LastEvaluatedKey?: Record<string, any>
}

export const handler = async (event: functionEvent, context: Context): Promise<APIGatewayProxyResult> => {
    try {
        event = await startScan(event)
        //check for LastEvaluatedKey to know if there are items left to scan and invoke next function
        if (event.LastEvaluatedKey)
            await startInvoke(event)
        else console.log('NO MORE ITEMS TO SCAN !')
    }
    catch (e) {
        console.error('SCAN/INVOKE ERROR ', e)
        const response = {
            statusCode: 500,
            body: JSON.stringify(e),
        };
        return response;
    }
    const response = {
        statusCode: 200,
        body: JSON.stringify('Done!'),
    };
    return response;
};
function startScan(event: functionEvent): Promise<functionEvent> {
    return new Promise(async (resolve, reject) => {
        try {
            const input = {
                TableName: "Etablissements",
                Limit: limit,
                ExclusiveStartKey: event.LastEvaluatedKey,
                ScanIndexForward: true
            };
            const command = new ScanCommand(input);
            const response = await docClient.send(command);
            response.Items?.forEach(item => {
                //if no codeUAI variable log error
                if (!item.codeUAI) console.error('No codeUAI variable present for ', JSON.stringify(item))
            })
            event.ScannedCount += response.Items?.length || 0
            //store last evalutaed key by scan in order to invoke next function to start at this point
            event.LastEvaluatedKey = response.LastEvaluatedKey
            console.log('SCANNED COUNT ', event.ScannedCount)
            return resolve(event)
        }
        catch (e) {
            return reject(e)
        }
    })
}

function startInvoke(event: functionEvent): Promise<void> {
    return new Promise(async (resolve, reject) => {
        try {
            const input = {
                FunctionName: "recursive_get_db_2",
                InvocationType: "Event",
                Payload: fromUtf8(JSON.stringify(event)),
            };
            const command = new InvokeCommand(input);
            await lambda.send(command);
            return resolve()
        }
        catch (e) {
            return reject(e)
        }
    })
}