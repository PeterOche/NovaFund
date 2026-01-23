import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ children, className = "", ...props }) => {
  return (
    <div
      className={`bg-gray-900 text-white p-6 rounded-lg shadow-lg ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
