
export interface ImageFile {
  file: File;
  previewUrl: string;
}

export interface Character {
  id: number;
  name: string;
  image: ImageFile | null;
  isSelected: boolean;
}

export interface BulkResult {
    id: number;
    prompt: string;
    images: string[];
    status: 'pending' | 'loading' | 'completed' | 'failed';
}
