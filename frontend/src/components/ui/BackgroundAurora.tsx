import React from 'react';

const BackgroundAurora: React.FC = () => {
    return (
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 overflow-hidden" style={{ backgroundColor: '#FAFAFA' }}>
            {/* Background Aurora */}
            <div
                className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] opacity-40 blur-[120px]"
                style={{
                    background: 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.15) 0%, rgba(255,255,255,0) 60%)'
                }}
            />
            <div
                className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] opacity-40 blur-[120px]"
                style={{
                    background: 'radial-gradient(circle at 50% 50%, rgba(251, 146, 60, 0.15) 0%, rgba(255,255,255,0) 60%)'
                }}
            />
            <div className="absolute inset-0 grid-lines opacity-[0.4]" />
        </div>
    );
};

export default BackgroundAurora;
