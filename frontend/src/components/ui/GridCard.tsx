import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Tag from './Tag';

interface GridCardProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
    meta?: string;
    colSpan?: string;
    delay?: number;
    onClick?: () => void;
}

const GridCard: React.FC<GridCardProps> = ({
    children,
    className = '',
    title,
    meta,
    colSpan = 'col-span-12',
    delay = 0,
    onClick
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        onClick={onClick}
        className={cn(
            "glass-panel p-6 flex flex-col relative overflow-hidden group transition-all duration-500",
            colSpan,
            onClick ? 'cursor-pointer hover:border-black hover:shadow-lg' : '',
            className
        )}
    >
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-black opacity-20" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-black opacity-20" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-black opacity-20" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-black opacity-20" />

        {(title || meta) && (
            <div className="flex justify-between items-start mb-6 z-10">
                {title && <h3 className="text-xl font-serif italic text-gray-900">{title}</h3>}
                {meta && <Tag>{meta}</Tag>}
            </div>
        )}
        <div className="relative z-10 flex-grow">{children}</div>

        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-violet-200 blur-[80px] opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none" />
    </motion.div>
);

export default GridCard;
