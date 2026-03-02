export interface ClientCommentUser {
  id: number;
  name: string;
  email: string;
}

export interface ClientComment {
  id: number;
  content: string;
  createdAt: string;
  user: ClientCommentUser;
}

export interface ClientCommentsResponse {
  comments: ClientComment[];
  pagination?: {
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
}
