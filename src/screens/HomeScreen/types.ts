export interface TrainingMode {
  id:       string;
  icon:     string;
  labelKey: string;
  color:    string;
}

export interface Topic {
  id:       number;
  title:    string;
  icon:     string;
  words:    number;
  progress: number;
}