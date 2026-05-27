export interface Project {
    name:string,
    key:string
}

export interface Epic {
    key: string;
    name: string;
    summary: string;
    status: string;
    progress: number;
    creator: string;
    creatorAvatar: string;
}