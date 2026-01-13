import { useState, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload as UploadIcon, X, CheckCircle, AlertCircle, Image, Loader2 } from "lucide-react";

interface FileWithPreview {
  file: File;
  preview: string;
  status: "pending" | "uploading" | "success" | "error";
  extractedData?: any;
  error?: string;
}

export default function UploadPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

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

        setFiles((prev) => {
          const newFiles = [...prev];
          newFiles[fileIndex] = {
            ...newFiles[fileIndex],
            status: "success",
            extractedData: result.extractedData,
          };
          return newFiles;
        });

        toast.success(`Extracted data for ${result.extractedData.presenterName}`);
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

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== "success"));
  };

  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Evaluations</h1>
        <p className="text-muted-foreground">
          Upload Game Presenter evaluation screenshots for automatic data extraction
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Screenshots</CardTitle>
          <CardDescription>
            Drag and drop evaluation screenshots or click to browse. Supports PNG, JPG, and WEBP formats.
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
                  Upload multiple evaluation screenshots at once
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
                    <span className="text-green-600">{successCount} processed</span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-red-600">{errorCount} failed</span>
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
                      <>Process {pendingCount} File{pendingCount !== 1 ? "s" : ""}</>
                    )}
                  </Button>
                </div>
              </div>

              {isProcessing && (
                <Progress value={progress} className="h-2" />
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="relative group border rounded-lg overflow-hidden bg-card"
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
                    <div className="p-2">
                      <p className="text-xs truncate font-medium">
                        {file.extractedData?.presenterName || file.file.name}
                      </p>
                      {file.extractedData && (
                        <p className="text-xs text-muted-foreground">
                          Score: {file.extractedData.totalScore}
                        </p>
                      )}
                      {file.error && (
                        <p className="text-xs text-red-500 truncate">{file.error}</p>
                      )}
                    </div>
                    {file.status === "pending" && (
                      <button
                        onClick={() => removeFile(index)}
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
  );
}
