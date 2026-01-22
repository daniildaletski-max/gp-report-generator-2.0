import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, CheckCircle, Loader2, Trash2, Image, Calendar, User, FileWarning, Heart, AlertTriangle, Star } from "lucide-react";
import { useDropzone } from "react-dropzone";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const CATEGORY_COLORS: Record<string, string> = {
  positive: "bg-green-100 text-green-800 border-green-200",
  neutral: "bg-gray-100 text-gray-800 border-gray-200",
  negative: "bg-red-100 text-red-800 border-red-200",
};

export default function AttitudeScreenshots() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const { data: screenshots, refetch, isLoading } = trpc.attitudeScreenshot.list.useQuery({
    month: selectedMonth,
    year: selectedYear,
  });

  const uploadMutation = trpc.attitudeScreenshot.upload.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error("Upload Failed", {
        description: error.message,
      });
    },
  });

  const deleteMutation = trpc.attitudeScreenshot.delete.useMutation({
    onSuccess: () => {
      toast.success("Deleted", {
        description: "Attitude screenshot deleted successfully",
      });
      refetch();
    },
    onError: (error) => {
      toast.error("Delete Failed", {
        description: error.message,
      });
    },
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: acceptedFiles.length });

    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      setUploadProgress({ current: i + 1, total: acceptedFiles.length });

      try {
        // Convert file to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix
            const base64Data = result.split(",")[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        await uploadMutation.mutateAsync({
          imageBase64: base64,
          filename: file.name,
          month: selectedMonth,
          year: selectedYear,
        });
      } catch (error) {
        console.error("Upload error:", error);
      }
    }

    setUploading(false);
    setUploadProgress(null);
    toast.success("Upload Complete", {
      description: `Successfully processed ${acceptedFiles.length} screenshot(s)`,
    });
  }, [selectedMonth, selectedYear, uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    disabled: uploading,
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // Calculate stats
  const stats = screenshots ? {
    total: screenshots.length,
    positive: screenshots.filter((s: any) => s.attitudeCategory === "positive").length,
    neutral: screenshots.filter((s: any) => s.attitudeCategory === "neutral").length,
    negative: screenshots.filter((s: any) => s.attitudeCategory === "negative").length,
    avgScore: screenshots.length > 0 
      ? (screenshots.reduce((sum: number, s: any) => sum + (s.attitudeScore || 0), 0) / screenshots.length).toFixed(1)
      : "0.0",
  } : null;

  const renderStars = (score: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= score ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
          />
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Attitude Screenshots</h1>
            <p className="text-muted-foreground">
              Upload attitude evaluation screenshots for AI analysis
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value.toString()}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.avgScore}/5</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-600">Positive</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.positive}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Neutral</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-600">{stats.neutral}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-600">Negative</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats.negative}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Upload Zone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Attitude Screenshots
            </CardTitle>
            <CardDescription>
              Drop attitude evaluation screenshots here. AI will automatically extract GP name, score, and description.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              } ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-lg font-medium">
                    Processing {uploadProgress?.current} of {uploadProgress?.total}...
                  </p>
                  <p className="text-sm text-muted-foreground">AI is analyzing the screenshots</p>
                </div>
              ) : isDragActive ? (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-primary" />
                  <p className="text-lg font-medium">Drop the files here</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Heart className="h-10 w-10 text-muted-foreground" />
                  <p className="text-lg font-medium">Drag & drop attitude screenshots here</p>
                  <p className="text-sm text-muted-foreground">or click to select files</p>
                  <p className="text-xs text-muted-foreground mt-2">Supports PNG, JPG, JPEG, WEBP</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Screenshots List */}
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Attitude Screenshots</CardTitle>
            <CardDescription>
              {screenshots?.length || 0} screenshots for {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : screenshots && screenshots.length > 0 ? (
              <div className="space-y-4">
                {screenshots.map((screenshot: any) => (
                  <div
                    key={screenshot.id}
                    className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {/* Screenshot Preview */}
                    <div className="w-full md:w-32 h-32 flex-shrink-0">
                      {screenshot.screenshotUrl ? (
                        <img
                          src={screenshot.screenshotUrl}
                          alt="Attitude screenshot"
                          className="w-full h-full object-cover rounded-md"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted rounded-md flex items-center justify-center">
                          <FileWarning className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={CATEGORY_COLORS[screenshot.attitudeCategory] || ""}>
                          {screenshot.attitudeCategory?.charAt(0).toUpperCase() + screenshot.attitudeCategory?.slice(1)}
                        </Badge>
                        {renderStars(screenshot.attitudeScore || 0)}
                        {screenshot.gamePresenterId ? (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            GP Matched
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            GP Not Found
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {screenshot.gpName || "Unknown"}
                        </span>
                        {screenshot.evaluatorName && (
                          <span>Evaluator: {screenshot.evaluatorName}</span>
                        )}
                      </div>

                      <p className="text-sm">{screenshot.description}</p>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(screenshot.createdAt).toLocaleDateString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate({ id: screenshot.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Heart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No attitude screenshots uploaded for this month</p>
                <p className="text-sm">Upload screenshots above to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
