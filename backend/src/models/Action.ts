import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAction extends Document {
  rootCauseId: string;
  anomalyId: string;
  organizationId: string;
  actionType: 'replenish_inventory' | 'escalate_ops_issue' | 'investigate_sku_listing';
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  suggestedOwner: string;
  assignedOwner?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  context: Record<string, unknown>;
  createdAt: Date;
  dueDate?: Date;
  completedAt?: Date;
}

const actionSchema = new Schema<IAction>(
  {
    rootCauseId: { type: String, required: true },
    anomalyId: { type: String, required: true },
    organizationId: { type: String, required: true },
    actionType: {
      type: String,
      enum: ['replenish_inventory', 'escalate_ops_issue', 'investigate_sku_listing'],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    priority: {
      type: String,
      enum: ['urgent', 'high', 'medium', 'low'],
      required: true,
    },
    suggestedOwner: { type: String, required: true },
    assignedOwner: String,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'dismissed'],
      default: 'pending',
    },
    context: { type: Schema.Types.Mixed, default: {} },
    dueDate: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

actionSchema.index({ status: 1, priority: 1 });
actionSchema.index({ assignedOwner: 1 });

export const Action: Model<IAction> =
  mongoose.models.Action ?? mongoose.model<IAction>('Action', actionSchema, 'actions');
