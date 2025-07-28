export interface Explanation {
  id: string;
  text: string;
  timestamp: string;
  language: 'english' | 'indonesian';
  isStreaming?: boolean;
  isComplete?: boolean;
}