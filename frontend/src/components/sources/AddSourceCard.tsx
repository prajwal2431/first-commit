import React from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface AddSourceCardProps {
    onAdd: () => void;
}

const AddSourceCard: React.FC<AddSourceCardProps> = ({ onAdd }) => {
    return (
        <motion.div
            onClick={onAdd}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-12 md:col-span-6 lg:col-span-4 min-h-[160px] border-2 border-dashed border-gray-300 bg-gray-50/50 flex flex-col items-center justify-center p-6 cursor-pointer hover:border-violet-500 hover:bg-violet-50/20 transition-all duration-300 group"
        >
            <div className="w-12 h-12 rounded bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-violet-500 transition-colors">
                <Plus size={24} />
            </div>
            <p className="mt-4 font-bold text-gray-700 group-hover:text-violet-700 transition-colors">
                Connect Integration
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-[200px] text-center">
                E-commerce, WMS, ERP or Marketing Data
            </p>
        </motion.div>
    );
};

export default AddSourceCard;
