import { useState, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Upload as UploadIcon, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  User,
  Calendar,
  Gamepad2,
  Star,
  Sparkles,
  Link2
} from "lucide-react";

interface ExtractedData {
  presenterName: string;
  evaluatorName?: string;
  date?: string;
  game?: string;
  totalScore?: number;
  hair?: { score: number; maxScore: number; comment?: string };
  makeup?: { score: number; maxScore: number; comment?: string };
  outfit?: { score: number; maxScore: number; comment?: string };
  posture?: { score: number; maxScore: number; comment?: string };
  dealingStyle?: { score: number; maxScore: number; comment?: string };
  gamePerformance?: { score: number; maxScore: number; comment?: string };
}

interface MatchInfo {
  matchedName: string;
  similarity: number;
  isExactMatch: boolean;
  isNewGP: boolean;
}

interface FileWithPreview {
  file: File;
  preview: string;
  status: "pending" | "uploading" | "success" | "error";
  extractedData?: ExtractedData;
  matchInfo?: MatchInfo;
  error?: string;
}

export default function UploadPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);

  const uploadMutation = trpc.evaluation.uploadAndExtract.useMutation();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith("image/")
    );
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (file) => file.type.startsWith("image/")
      );
      addFiles(selectedFiles);
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const filesWithPreview: FileWithPreview[] = newFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...filesWithPreview]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const processFiles = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgress(0);

    const pendingFiles = files.filter((f) => f.status === "pending");
    let processed = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileIndex = files.findIndex((f) => f === pendingFiles[i]);
      
      setFiles((prev) => {
        const newFiles = [...prev];
        newFiles[fileIndex] = { ...newFiles[fileIndex], status: "uploading" };
        return newFiles;
      });

      try {
        const base64 = await fileToBase64(pendingFiles[i].file);
        const result = await uploadMutation.mutateAsync({
          imageBase64: base64,
          filename: pendingFiles[i].file.name,
          mimeType: pendingFiles[i].file.type,
        });

        // Determine match info
        const extractedName = result.extractedData.presenterName;
        const matchedName = result.gamePresenter.name;
        const isExactMatch = extractedName.toLowerCase().trim() === matchedName.toLowerCase().trim();
        const isNewGP = !result.gamePresenter.createdAt || 
          (new Date().getTime() - new Date(result.gamePresenter.createdAt).getTime()) < 5000;

        // Calculate similarity for display
        const similarity = isExactMatch ? 100 : calculateDisplaySimilarity(extractedName, matchedName);

        setFiles((prev) => {
          const newFiles = [...prev];
          newFiles[fileIndex] = {
            ...newFiles[fileIndex],
            status: "success",
            extractedData: result.extractedData,
            matchInfo: {
              matchedName,
              similarity,
              isExactMatch,
              isNewGP,
            },
          };
          return newFiles;
        });

        if (isNewGP) {
          toast.success(`Created new GP: ${matchedName}`);
        } else if (!isExactMatch) {
          toast.success(`Matched "${extractedName}" → "${matchedName}" (${similarity}% similar)`);
        } else {
          toast.success(`Extracted data for ${matchedName}`);
        }
      } catch (error: any) {
        setFiles((prev) => {
          const newFiles = [...prev];
          newFiles[fileIndex] = {
            ...newFiles[fileIndex],
            status: "error",
            error: error.message || "Failed to process",
          };
          return newFiles;
        });

        toast.error(`Failed to process ${pendingFiles[i].file.name}`);
      }

      processed++;
      setProgress((processed / pendingFiles.length) * 100);
    }

    setIsProcessing(false);
    toast.success(`Processed ${processed} files`);
  };

  // Simple similarity calculation for display purposes
  const calculateDisplaySimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 100;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 100;
    
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }
    
    return Math.round((matches / longer.length) * 100);
  };

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== "success"));
    setSelectedFile(null);
  };

  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Evaluations</h1>
        <p className="text-muted-foreground">
          Upload Game Presenter evaluation screenshots for automatic AI-powered data extraction
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Upload Screenshots
              </CardTitle>
              <CardDescription>
                Drag and drop evaluation screenshots or click to browse. AI will automatically extract all data including GP name matching.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <div className="p-4 rounded-full bg-primary/10">
                    <UploadIcon className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Drop screenshots here or click to upload</p>
                    <p className="text-sm text-muted-foreground">
                      Supports PNG, JPG, WEBP • Multiple files supported
                    </p>
                  </div>
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {files.length} file{files.length !== 1 ? "s" : ""} selected
                      </span>
                      {successCount > 0 && (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {successCount} processed
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {errorCount} failed
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {successCount > 0 && (
                        <Button variant="outline" size="sm" onClick={clearCompleted}>
                          Clear Completed
                        </Button>
                      )}
                      <Button
                        onClick={processFiles}
                        disabled={isProcessing || pendingCount === 0}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Process {pendingCount} File{pendingCount !== 1 ? "s" : ""}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {isProcessing && (
                    <Progress value={progress} className="h-2" />
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className={`relative group border rounded-lg overflow-hidden bg-card cursor-pointer transition-all ${
                          selectedFile === file ? "ring-2 ring-primary" : "hover:border-primary/50"
                        }`}
                        onClick={() => file.status === "success" && setSelectedFile(file)}
                      >
                        <div className="aspect-[3/4] relative">
                          <img
                            src={file.preview}
                            alt={file.file.name}
                            className="w-full h-full object-cover"
                          />
                          <div
                            className={`absolute inset-0 flex items-center justify-center ${
                              file.status === "uploading"
                                ? "bg-black/50"
                                : file.status === "success"
                                ? "bg-green-500/20"
                                : file.status === "error"
                                ? "bg-red-500/20"
                                : ""
                            }`}
                          >
                            {file.status === "uploading" && (
                              <Loader2 className="h-8 w-8 text-white animate-spin" />
                            )}
                            {file.status === "success" && (
                              <CheckCircle className="h-8 w-8 text-green-500" />
                            )}
                            {file.status === "error" && (
                              <AlertCircle className="h-8 w-8 text-red-500" />
                            )}
                          </div>
                        </div>
                        <div className="p-2 space-y-1">
                          <p className="text-xs truncate font-medium">
                            {file.extractedData?.presenterName || file.file.name}
                          </p>
                          {file.matchInfo && !file.matchInfo.isExactMatch && !file.matchInfo.isNewGP && (
                            <div className="flex items-center gap-1">
                              <Link2 className="h-3 w-3 text-blue-500" />
                              <span className="text-xs text-blue-600 truncate">
                                → {file.matchInfo.matchedName}
                              </span>
                            </div>
                          )}
                          {file.matchInfo?.isNewGP && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              New GP
                            </Badge>
                          )}
                          {file.extractedData && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              <span className="text-xs text-muted-foreground">
                                {file.extractedData.totalScore}
                              </span>
                            </div>
                          )}
                          {file.error && (
                            <p className="text-xs text-red-500 truncate">{file.error}</p>
                          )}
                        </div>
                        {file.status === "pending" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Extracted Data</CardTitle>
              <CardDescription>
                {selectedFile ? "Click on a processed file to view details" : "Select a processed file to view extracted data"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedFile?.extractedData ? (
                <div className="space-y-4">
                  {/* GP Name & Match Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>Game Presenter</span>
                    </div>
                    <div className="pl-6">
                      <p className="font-medium">{selectedFile.extractedData.presenterName}</p>
                      {selectedFile.matchInfo && !selectedFile.matchInfo.isExactMatch && !selectedFile.matchInfo.isNewGP && (
                        <div className="mt-1 p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
                          <div className="flex items-center gap-2 text-sm">
                            <Link2 className="h-4 w-4 text-blue-500" />
                            <span className="text-blue-700 dark:text-blue-300">
                              Matched to: <strong>{selectedFile.matchInfo.matchedName}</strong>
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <Progress value={selectedFile.matchInfo.similarity} className="h-1.5 flex-1" />
                            <span className="text-xs text-blue-600">{selectedFile.matchInfo.similarity}%</span>
                          </div>
                        </div>
                      )}
                      {selectedFile.matchInfo?.isNewGP && (
                        <Badge className="mt-1 bg-green-100 text-green-800 hover:bg-green-100">
                          New GP Created
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Date & Game */}
                  <div className="grid grid-cols-2 gap-4">
                    {selectedFile.extractedData.date && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>Date</span>
                        </div>
                        <p className="pl-6 text-sm">{selectedFile.extractedData.date}</p>
                      </div>
                    )}
                    {selectedFile.extractedData.game && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Gamepad2 className="h-4 w-4" />
                          <span>Game</span>
                        </div>
                        <p className="pl-6 text-sm">{selectedFile.extractedData.game}</p>
                      </div>
                    )}
                  </div>

                  {/* Total Score */}
                  {selectedFile.extractedData.totalScore !== undefined && (
                    <div className="p-3 bg-primary/5 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Score</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                          <span className="text-2xl font-bold">{selectedFile.extractedData.totalScore}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scores Breakdown */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Scores Breakdown</p>
                    <div className="space-y-2">
                      {[
                        { key: "hair", label: "Hair" },
                        { key: "makeup", label: "Makeup" },
                        { key: "outfit", label: "Outfit" },
                        { key: "posture", label: "Posture" },
                        { key: "dealingStyle", label: "Dealing Style" },
                        { key: "gamePerformance", label: "Game Performance" },
                      ].map(({ key, label }) => {
                        const data = selectedFile.extractedData?.[key as keyof ExtractedData] as { score: number; maxScore: number; comment?: string } | undefined;
                        if (!data) return null;
                        const percentage = (data.score / data.maxScore) * 100;
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span>{label}</span>
                              <span className="font-medium">{data.score}/{data.maxScore}</span>
                            </div>
                            <Progress 
                              value={percentage} 
                              className={`h-1.5 ${percentage >= 80 ? "[&>div]:bg-green-500" : percentage >= 60 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
                            />
                            {data.comment && (
                              <p className="text-xs text-muted-foreground italic pl-2 border-l-2 border-muted">
                                {data.comment}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">
                    Upload and process screenshots to see extracted evaluation data here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
