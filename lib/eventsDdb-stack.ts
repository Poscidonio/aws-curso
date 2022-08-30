import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class EventsDdbStack extends cdk.Stack {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, 'EventsDdb', {
      tableName: 'events',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      //Define o que acontece caso a stack seja destruida a tabela continua sem a stack
      removalPolicy: RemovalPolicy.DESTROY,
      // billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, pagamento por requisição é mais caro porem nao gargala o sistema
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: 'emailIdx',
      partitionKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING,
      },
      //prestar atencao na criacao do index porque depois é dificil mudar !!
      //aqui seria 'sk'
      sortKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
      readCapacity: 1,
      writeCapacity: 1,
    });
  }
}
