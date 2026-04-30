import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calendar,
  Gamepad2,
  Star,
  Link2,
  RotateCcw,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Heart,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  CloudUpload,
  ImagePlus,
  Clipboard,
} from "lucide-react";

// ============ TYPES ============

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

interface AttitudeEntry {
  date: string;
  type: "POSITIVE" | "NEGATIVE";
  comment: string;
  score: number;
}

interface AttitudeData {
  gpName: string | null;
  entries: AttitudeEntry[];
  totalEntries: number;
  totalNegative: number;
  totalPositive: number;
}

interface ErrorData {
  presenterName: string;
  date?: string;
  errorType: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
}

interface MatchInfo {
  matchedName: string;
  similarity: number;
  isExactMatch: boolean;
  isNewGP: boolean;
}

interface FileWithPreview {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "uploading" | "success" | "error";
  extractedData?: ExtractedData;
  attitudeData?: AttitudeData;
  errorData?: ErrorData;
  matchInfo?: MatchInfo;
  error?: string;
  progress?: number;
  processingTime?: number;
  expanded?: boolean;
}

type UploadType = "evaluations" | "attitude";

// ============ UTILITIES ============

async function compressImage(file: File, maxWidth: number = 1920, quality: number = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function getScoreColor(score: number, maxScore: number): string {
  const pct = (score / maxScore) * 100;
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 60) return "text-amber-600";
  return "text-red-600";
}

function getScoreBg(score: number, maxScore: number): string {
  const pct = (score / maxScore) * 100;
  if (pct >= 80) return "bg-emerald-50 border-emerald-200";
  if (pct >= 60) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

// ============ SCORE BAR COMPONENT ============

function ScoreBar({ label, score, maxScore, comment }: { label: string; score: number; maxScore: number; comment?: string }) {
  const pct = (score / maxScore) * 100;
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${getScoreColor(score, maxScore)}`}>{score}/{maxScore}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {comment && <p className="text-xs text-muted-foreground mt-0.5 italic">{comment}</p>}
    </div>
  );
}

// ============ RESULT CARD COMPONENT ============

function EvaluationResultCard({ file, onRemove, onRetry }: { file: FileWithPreview; onRemove: (id: string) => void; onRetry: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const data = file.extractedData;
  
  if (file.status === "uploading") {
    return (
      <div className="border border-border rounded-xl p-4 bg-background animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-muted">
            <img src={file.preview} alt="" className="w-full h-full object-cover opacity-50" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Extracting data with AI...</span>
            </div>
            <Progress value={file.progress || 0} className="h-1.5 rounded-full" />
          </div>
        </div>
      </div>
    );
  }
  
  if (file.status === "error") {
    return (
      <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 relative">
            <img src={file.preview} alt="" className="w-full h-full object-cover opacity-50" />
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700">Failed to process</p>
            <p className="text-xs text-red-500 mt-0.5 truncate">{file.error || "Unknown error"}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => onRetry(file.id)} className="text-xs h-8">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRemove(file.id)} className="text-xs h-8 text-red-500 hover:text-red-700">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  if (file.status === "pending") {
    return (
      <div className="border border-border rounded-xl p-4 bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
            <img src={file.preview} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{file.file.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Waiting to process...</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onRemove(file.id)} className="text-xs h-8 text-muted-foreground hover:text-red-500 shrink-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }
  
  // Success state
  if (!data) return null;
  
  const totalScore = data.totalScore || 0;
  const maxPossible = 22;
  const scorePct = (totalScore / maxPossible) * 100;
  
  return (
    <div className="border border-border rounded-xl bg-background overflow-hidden hover:shadow-md transition-shadow">
      {/* Main row - always visible */}
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Thumbnail */}
        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-border">
          <img src={file.preview} alt="" className="w-full h-full object-cover" />
        </div>
        
        {/* GP Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground truncate">{data.presenterName}</p>
            {file.matchInfo?.isNewGP && (
              <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">New</Badge>
            )}
            {file.matchInfo && !file.matchInfo.isExactMatch && !file.matchInfo.isNewGP && (
              <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200 shrink-0">
                <Link2 className="h-2.5 w-2.5 mr-0.5" />
                {file.matchInfo.similarity}%
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {data.date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {data.date}
              </span>
            )}
            {data.game && (
              <span className="flex items-center gap-1">
                <Gamepad2 className="h-3 w-3" />
                {data.game}
              </span>
            )}
            {file.processingTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {(file.processingTime / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        
        {/* Score */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shrink-0 ${getScoreBg(totalScore, maxPossible)}`}>
          <Star className={`h-4 w-4 ${getScoreColor(totalScore, maxPossible)}`} />
          <span className={`text-lg font-bold ${getScoreColor(totalScore, maxPossible)}`}>{totalScore}</span>
          <span className="text-xs text-muted-foreground">/{maxPossible}</span>
        </div>
        
        {/* Expand toggle */}
        <button className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </div>
      
      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3 bg-muted/20">
          {/* Match info */}
          {file.matchInfo && !file.matchInfo.isExactMatch && !file.matchInfo.isNewGP && (
            <div className="flex items-center gap-2 text-sm p-2.5 rounded-lg bg-blue-50 border border-blue-200">
              <Link2 className="h-4 w-4 text-blue-600" />
              <span className="text-blue-700">
                Matched to <strong>{file.matchInfo.matchedName}</strong> ({file.matchInfo.similarity}% similarity)
              </span>
            </div>
          )}
          
          {/* Score breakdown */}
          <div className="space-y-2.5">
            {[
              { key: "hair", label: "Hair" },
              { key: "makeup", label: "Makeup" },
              { key: "outfit", label: "Outfit" },
              { key: "posture", label: "Posture" },
              { key: "dealingStyle", label: "Dealing Style" },
              { key: "gamePerformance", label: "Game Performance" },
            ].map(({ key, label }) => {
              const scoreData = data[key as keyof ExtractedData] as { score: number; maxScore: number; comment?: string } | undefined;
              if (!scoreData) return null;
              return <ScoreBar key={key} label={label} score={scoreData.score} maxScore={scoreData.maxScore} comment={scoreData.comment} />;
            })}
          </div>
          
          {/* Evaluator */}
          {data.evaluatorName && (
            <p className="text-xs text-muted-foreground pt-1">
              Evaluated by: <span className="font-medium text-foreground">{data.evaluatorName}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============ ATTITUDE RESULT CARD ============

function AttitudeResultCard({ file, onRemove, onRetry }: { file: FileWithPreview; onRemove: (id: string) => void; onRetry: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const data = file.attitudeData;
  
  if (file.status === "uploading") {
    return (
      <div className="border border-border rounded-xl p-4 bg-background animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-muted">
            <img src={file.preview} alt="" className="w-full h-full object-cover opacity-50" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Extracting attitude data...</span>
            </div>
            <Progress value={file.progress || 0} className="h-1.5 rounded-full" />
          </div>
        </div>
      </div>
    );
  }
  
  if (file.status === "error") {
    return (
      <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 relative">
            <img src={file.preview} alt="" className="w-full h-full object-cover opacity-50" />
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700">Failed to process</p>
            <p className="text-xs text-red-500 mt-0.5 truncate">{file.error || "Unknown error"}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => onRetry(file.id)} className="text-xs h-8">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRemove(file.id)} className="text-xs h-8 text-red-500 hover:text-red-700">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  if (file.status === "pending") {
    return (
      <div className="border border-border rounded-xl p-4 bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
            <img src={file.preview} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{file.file.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Waiting to process...</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onRemove(file.id)} className="text-xs h-8 text-muted-foreground hover:text-red-500 shrink-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }
  
  if (!data) return null;
  
  return (
    <div className="border border-border rounded-xl bg-background overflow-hidden hover:shadow-md transition-shadow">
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-border">
          <img src={file.preview} alt="" className="w-full h-full object-cover" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{data.gpName || "Unknown GP"}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{data.totalEntries} entries</span>
            {file.processingTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {(file.processingTime / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        
        {/* Attitude summary badges */}
        <div className="flex items-center gap-2 shrink-0">
          {data.totalPositive > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold">
              <ThumbsUp className="h-3 w-3" />
              +{data.totalPositive}
            </span>
          )}
          {data.totalNegative > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
              <ThumbsDown className="h-3 w-3" />
              -{data.totalNegative}
            </span>
          )}
        </div>
        
        <button className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </div>
      
      {expanded && data.entries && data.entries.length > 0 && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2 bg-muted/20">
          {data.entries.map((entry, idx) => (
            <div key={idx} className={`p-3 rounded-lg text-sm ${entry.type === 'POSITIVE' ? 'bg-emerald-50 border-l-3 border-emerald-500' : 'bg-red-50 border-l-3 border-red-500'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {entry.type === "POSITIVE" ? (
                    <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ThumbsDown className="h-3.5 w-3.5 text-red-600" />
                  )}
                  <span className={`font-medium ${entry.type === "POSITIVE" ? "text-emerald-700" : "text-red-700"}`}>
                    {entry.type === "POSITIVE" ? `+${entry.score}` : `${entry.score}`}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{entry.date}</span>
              </div>
              <p className="text-muted-foreground ml-5">{entry.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function UploadPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<UploadType>("evaluations");
  // Files are scoped per tab so switching between Evaluations / Attitude
  // doesn't silently throw away an in-progress batch.
  const [filesByTab, setFilesByTab] = useState<Record<UploadType, FileWithPreview[]>>({
    evaluations: [],
    attitude: [],
  });
  const files = filesByTab[activeTab];
  const setFiles = useCallback(
    (updater: FileWithPreview[] | ((prev: FileWithPreview[]) => FileWithPreview[])) => {
      setFilesByTab(prev => ({
        ...prev,
        [activeTab]: typeof updater === "function" ? updater(prev[activeTab]) : updater,
      }));
    },
    [activeTab],
  );
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [selectedGpId, setSelectedGpId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const { data: gpList } = trpc.gamePresenter.list.useQuery();

  const uploadEvaluationMutation = trpc.evaluation.uploadAndExtract.useMutation();
  const uploadAttitudeMutation = trpc.attitudeScreenshot.upload.useMutation();

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const stats = useMemo(() => {
    const successFiles = files.filter(f => f.status === "success");
    const errorFiles = files.filter(f => f.status === "error");
    const pendingFiles = files.filter(f => f.status === "pending");
    const uploadingFiles = files.filter(f => f.status === "uploading");
    return {
      total: files.length,
      success: successFiles.length,
      pending: pendingFiles.length,
      uploading: uploadingFiles.length,
      error: errorFiles.length,
    };
  }, [files]);

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            const newFile = new File([file], `screenshot-${Date.now()}.png`, { type: file.type });
            imageFiles.push(newFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        if (activeTab === "attitude" && !selectedGpId) {
          toast.error("Select a Game Presenter before pasting attitude screenshots");
          return;
        }
        toast.success(`Pasted ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} from clipboard`);
        addFiles(imageFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [activeTab, selectedGpId]);

  // Auto-process pending files
  useEffect(() => {
    if (!processingRef.current) {
      const pendingFiles = files.filter(f => f.status === "pending");
      if (pendingFiles.length > 0) {
        processFiles();
      }
    }
  }, [files]);

  // Files are kept in `filesByTab`; switching tabs preserves both batches.

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
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (file) => file.type.startsWith("image/")
      );
      if (selectedFiles.length > 0) {
        addFiles(selectedFiles);
      }
      e.target.value = "";
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const filesWithPreview: FileWithPreview[] = newFiles.map((file) => ({
      id: generateId(),
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...filesWithPreview]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find(f => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const retryFile = (id: string) => {
    setFiles((prev) => prev.map(f => 
      f.id === id ? { ...f, status: "pending" as const, error: undefined, progress: 0 } : f
    ));
  };

  const processFiles = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0 || processingRef.current) return;

    processingRef.current = true;
    setIsProcessing(true);
    setOverallProgress(0);

    let processed = 0;
    const total = pendingFiles.length;

    const batchSize = 3;
    for (let i = 0; i < pendingFiles.length; i += batchSize) {
      const batch = pendingFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (pendingFile) => {
        const fileId = pendingFile.id;
        const fileStartTime = Date.now();
        
        setFiles((prev) => prev.map(f => 
          f.id === fileId ? { ...f, status: "uploading" as const, progress: 10 } : f
        ));

        try {
          setFiles((prev) => prev.map(f => 
            f.id === fileId ? { ...f, progress: 20 } : f
          ));
          
          const base64 = await compressImage(pendingFile.file, 1920, 0.85);
          
          setFiles((prev) => prev.map(f => 
            f.id === fileId ? { ...f, progress: 40 } : f
          ));
          
          let result: any;

          if (activeTab === "evaluations") {
            result = await uploadEvaluationMutation.mutateAsync({
              imageBase64: base64,
              filename: pendingFile.file.name,
              mimeType: 'image/jpeg',
            });
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId ? { ...f, progress: 80 } : f
            ));

            const processingTime = Date.now() - fileStartTime;
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId 
                ? { 
                    ...f, 
                    status: "success" as const, 
                    extractedData: result.extractedData,
                    matchInfo: result.matchInfo,
                    progress: 100,
                    processingTime,
                  } 
                : f
            ));
          } else if (activeTab === "attitude") {
            if (!selectedGpId) {
              throw new Error("Please select a Game Presenter first");
            }
            result = await uploadAttitudeMutation.mutateAsync({
              imageBase64: base64,
              filename: pendingFile.file.name,
              mimeType: 'image/jpeg',
              gpId: selectedGpId,
            });
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId ? { ...f, progress: 80 } : f
            ));

            const processingTime = Date.now() - fileStartTime;
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId 
                ? { 
                    ...f, 
                    status: "success" as const, 
                    attitudeData: result.extractedData,
                    matchInfo: result.matchInfo,
                    progress: 100,
                    processingTime,
                  } 
                : f
            ));
          }
          
          processed++;
          setOverallProgress((processed / total) * 100);
          
        } catch (err: any) {
          console.error("Upload error:", err);
          setFiles((prev) => prev.map(f => 
            f.id === fileId 
              ? { 
                  ...f, 
                  status: "error" as const, 
                  error: err.message || "Failed to process",
                  progress: 0,
                } 
              : f
          ));
          processed++;
          setOverallProgress((processed / total) * 100);
        }
      }));
    }

    processingRef.current = false;
    setIsProcessing(false);
  };

  const clearAll = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setShowClearConfirm(false);
  };

  const requestClearAll = () => {
    // Skip the confirmation if everything has already been processed and saved —
    // there's nothing to lose.
    const hasUnfinished = files.some(f => f.status === "pending" || f.status === "uploading" || f.status === "error");
    if (!hasUnfinished) {
      clearAll();
      return;
    }
    setShowClearConfirm(true);
  };

  const retryFailed = () => {
    setFiles(prev => prev.map(f => 
      f.status === "error" ? { ...f, status: "pending" as const, error: undefined, progress: 0 } : f
    ));
  };

  const hasFiles = files.length > 0;
  const attitudeBlocked = activeTab === "attitude" && !selectedGpId;

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Upload Screenshots"
        subtitle={
          activeTab === "evaluations"
            ? "Upload evaluation screenshots — AI extracts scores automatically"
            : "Upload attitude screenshots for the selected GP"
        }
        icon={CloudUpload}
      />

      {/* Tab Switcher */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UploadType)}>
        <TabsList className="bg-muted/50 border border-border rounded-xl p-1">
          <TabsTrigger value="evaluations" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileCheck className="h-4 w-4" />
            Evaluations
          </TabsTrigger>
          <TabsTrigger value="attitude" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Heart className="h-4 w-4" />
            Attitude
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* GP Selector for Attitude */}
      {activeTab === "attitude" && (
        <div className="p-4 rounded-xl border border-border bg-background">
          <label className="text-sm font-medium text-foreground block mb-2">
            Select Game Presenter <span className="text-red-500">*</span>
          </label>
          <select
            className="w-full rounded-lg px-3 py-2.5 border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            value={selectedGpId || ""}
            onChange={(e) => setSelectedGpId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Choose a GP...</option>
            {gpList?.map((gp) => (
              <option key={gp.id} value={gp.id}>{gp.name}</option>
            ))}
          </select>
          {!selectedGpId && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Attitude entries can only be registered against a selected presenter — pick one above to enable upload.
            </p>
          )}
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={`relative rounded-xl border-2 border-dashed transition-all ${
          attitudeBlocked
            ? "border-border/60 bg-muted/10 cursor-not-allowed opacity-60"
            : isDragging
              ? "border-primary bg-primary/5 scale-[1.01] cursor-pointer"
              : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/30 cursor-pointer"
        } ${hasFiles ? "p-6" : "p-12"}`}
        onDragOver={attitudeBlocked ? undefined : handleDragOver}
        onDragLeave={attitudeBlocked ? undefined : handleDragLeave}
        onDrop={attitudeBlocked ? undefined : handleDrop}
        onClick={() => {
          if (attitudeBlocked) {
            toast.error("Select a Game Presenter before uploading attitude screenshots");
            return;
          }
          fileInputRef.current?.click();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
        />
        <div className="flex flex-col items-center gap-3 text-center">
          {hasFiles ? (
            <>
              <div className="flex items-center gap-3 text-muted-foreground">
                <ImagePlus className="h-5 w-5" />
                <span className="text-sm font-medium">Drop more screenshots or click to add</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-muted border border-border">Ctrl+V</span>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <CloudUpload className={`h-8 w-8 transition-colors ${isDragging ? "text-primary" : "text-primary/60"}`} />
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">
                  {isDragging ? "Drop files here" : "Drop screenshots here or click to upload"}
                </p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  PNG, JPG, WEBP — multiple files supported
                </p>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border">
                  <Clipboard className="h-3 w-3" />
                  Ctrl+V to paste
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border">
                  <ImagePlus className="h-3 w-3" />
                  Click to browse
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Processing Progress */}
      {isProcessing && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <div className="flex-1">
            <Progress value={overallProgress} className="h-1.5 rounded-full" />
          </div>
          <span className="text-sm font-medium text-primary shrink-0">{Math.round(overallProgress)}%</span>
        </div>
      )}

      {/* Action Bar */}
      {hasFiles && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{stats.total} file{stats.total !== 1 ? "s" : ""}</span>
            {stats.success > 0 && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle className="h-3.5 w-3.5" />
                {stats.success} done
              </span>
            )}
            {stats.uploading > 0 && (
              <span className="flex items-center gap-1 text-blue-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {stats.uploading} processing
              </span>
            )}
            {stats.error > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {stats.error} failed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {stats.error > 0 && (
              <Button variant="outline" size="sm" onClick={retryFailed} className="text-xs h-8">
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry failed
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={requestClearAll} className="text-xs h-8 text-muted-foreground hover:text-red-600">
              <Trash2 className="h-3 w-3 mr-1" />
              Clear all
            </Button>
          </div>
        </div>
      )}

      {/* Results List */}
      {hasFiles && (
        <div className="space-y-3">
          {files.map((file) =>
            activeTab === "evaluations" ? (
              <EvaluationResultCard key={file.id} file={file} onRemove={removeFile} onRetry={retryFile} />
            ) : (
              <AttitudeResultCard key={file.id} file={file} onRemove={removeFile} onRetry={retryFile} />
            ),
          )}
        </div>
      )}

      {/* Batch Summary */}
      {stats.success > 0 && !isProcessing && stats.pending === 0 && stats.uploading === 0 && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-800">
                {stats.success} screenshot{stats.success !== 1 ? "s" : ""} processed successfully
              </p>
              <p className="text-sm text-emerald-600 mt-0.5">
                {stats.error > 0 ? `${stats.error} failed — click "Retry failed" above` : "All data has been saved to the database"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {!hasFiles && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Tip: You can paste screenshots directly from clipboard with <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-xs font-mono">Ctrl+V</kbd>
          </p>
        </div>
      )}

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {files.length} file{files.length !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const pending = files.filter(f => f.status === "pending" || f.status === "uploading").length;
                const failed = files.filter(f => f.status === "error").length;
                const parts: string[] = [];
                if (pending > 0) parts.push(`${pending} not yet processed`);
                if (failed > 0) parts.push(`${failed} failed (still retryable)`);
                const detail = parts.length > 0 ? ` ${parts.join(" and ")} will be lost.` : "";
                return `This removes everything from the list.${detail} This action can't be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep files</AlertDialogCancel>
            <AlertDialogAction
              onClick={clearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
