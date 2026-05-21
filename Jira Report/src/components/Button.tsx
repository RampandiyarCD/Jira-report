import { type ReactNode } from "react";


interface Buttonprops {
    name?: ReactNode;
    onClick?: () => void;
    className?: string;
}

export const Button = ({name, onClick, className }:Buttonprops) => {
    return (
        <button className={className} onClick={onClick}>{name}</button>
    )
}