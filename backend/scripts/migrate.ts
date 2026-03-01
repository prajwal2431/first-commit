import { connect, connection } from 'mongoose';
import { AnalysisSession } from '../src/models/AnalysisSession';

async function migrate() {
    console.log("Connecting to DB...");
    await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nexus');
    console.log("Dropping old AnalysisSessions...");
    await AnalysisSession.deleteMany({});
    console.log("Migration complete.");
    await connection.close();
}

migrate().catch(console.error);
