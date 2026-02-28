import mongoose, { Schema, Document, Model } from 'mongoose';

export interface Department {
    id: string;
    name: string;
    email: string;
}

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
}

export interface IOrgSettings extends Document {
    organizationId: string;
    departments: Department[];
    smtp: SmtpConfig | null;
    createdAt: Date;
    updatedAt: Date;
}

const orgSettingsSchema = new Schema<IOrgSettings>(
    {
        organizationId: { type: String, required: true, unique: true },
        departments: {
            type: [
                {
                    id: { type: String, required: true },
                    name: { type: String, required: true },
                    email: { type: String, required: true },
                },
            ],
            default: [
                { id: 'supply-chain', name: 'Supply Chain', email: '' },
                { id: 'marketing', name: 'Marketing', email: '' },
                { id: 'finance', name: 'Finance', email: '' },
                { id: 'operations', name: 'Operations', email: '' },
                { id: 'product', name: 'Product', email: '' },
            ],
        },
        smtp: { type: Schema.Types.Mixed, default: null },
    },
    { timestamps: true }
);

export const OrgSettings: Model<IOrgSettings> =
    mongoose.models.OrgSettings ??
    mongoose.model<IOrgSettings>('OrgSettings', orgSettingsSchema, 'org_settings');
