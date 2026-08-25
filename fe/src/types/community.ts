export type CommunityDocument = {
  id: string;
  title: string;
  description: string;
  subject: string;
  category: string;
  fileType: string;
  fileSize?: string;
  pages: number;
  owner: string;
  savedCount: number;
  saved?: boolean;
  owned?: boolean;
  updatedAt: string;
  accent: "amber" | "blue" | "green" | "rose";
};
