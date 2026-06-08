import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Users,
  TrendingUp,
  CircleDot,
  Zap,
  ScanLine,
} from "lucide-react";

// Bulk review panel is lazy-loaded so the Quick path stays lean — its code
// (react-dropzone, the editable review grid) only ships when the user
// switches to Bulk AI mode.
const BulkUploadPanel = lazy(() =>
  import("./UploadBulk").then((m) => ({ default: m.BulkUploadPanel })),
);

type UploadMode = "quick" | "bulk";

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

function QuickUploadPanel({ modeToggle, onSwitchToBulk }: { modeToggle: ReactNode; onSwitchToBulk: () => void }) {
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
  const [bulkTipDismissed, setBulkTipDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [selectedGpId, setSelectedGpId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const { data: gpList } = trpc.gamePresenter.list.useQuery();
  const [coverageMonth] = useState(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  });

  // Company-wide coverage — every GP, no team scoping.
  const { data: coverageData, isLoading: coverageLoading } = trpc.evaluation.coverage.useQuery(
    { month: coverageMonth.month, year: coverageMonth.year },
  );

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
        title="Upload"
        subtitle={
          activeTab === "evaluations"
            ? "AI extracts scores and saves each screenshot automatically"
            : "Upload attitude screenshots for the selected GP"
        }
        icon={CloudUpload}
        actions={modeToggle}
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

      {/* Coverage Panel */}
      {activeTab === "evaluations" && (
        <CoveragePanel
          coverageData={coverageData}
          coverageLoading={coverageLoading}
          coverageMonth={coverageMonth}
        />
      )}

      {/* GP Selector for Attitude — replaced native <select> with the
          Shadcn Select so it matches every other dropdown in the app
          and carries proper keyboard navigation / focus rings. */}
      {activeTab === "attitude" && (
        <div className="p-4 rounded-xl border border-amber-200/60 bg-amber-50/40">
          <label className="text-sm font-medium text-foreground block mb-2 flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-amber-600" />
            Select Game Presenter <span className="text-red-500">*</span>
          </label>
          <Select
            value={selectedGpId ? String(selectedGpId) : undefined}
            onValueChange={(v) => setSelectedGpId(v ? Number(v) : null)}
          >
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="Choose a GP…" />
            </SelectTrigger>
            <SelectContent>
              {(gpList ?? []).map((gp) => (
                <SelectItem key={gp.id} value={String(gp.id)}>
                  {gp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedGpId && (
            <p className="text-xs text-amber-700 mt-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
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

      {/* Live status strip — visible breakdown of the current batch.
          Only renders when there's at least one file, so the page
          stays calm in the empty state. */}
      {hasFiles && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <UploadStat icon={ImagePlus} label="Total" value={stats.total} tone="slate" />
          <UploadStat icon={CheckCircle} label="Processed" value={stats.success} tone="emerald" />
          <UploadStat icon={Loader2} label="In progress" value={stats.uploading + stats.pending} tone="sky" spin={stats.uploading > 0} />
          <UploadStat icon={AlertCircle} label="Failed" value={stats.error} tone="rose" />
        </div>
      )}

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

      {/* Empty state hint + Bulk AI nudge (evaluations only) — shown before
          any files are dropped, i.e. exactly at the decision point. */}
      {!hasFiles && (
        <div className="space-y-3">
          {activeTab === "evaluations" && !bulkTipDismissed && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <ScanLine className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm text-foreground flex-1">
                Uploading a large batch?{" "}
                <span className="text-muted-foreground">Bulk AI extracts them in parallel and lets you review every read before saving.</span>
              </p>
              <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onSwitchToBulk}>
                <ScanLine className="h-3.5 w-3.5 mr-1.5" /> Switch to Bulk AI
              </Button>
              <button
                type="button"
                onClick={() => setBulkTipDismissed(true)}
                aria-label="Dismiss tip"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Tip: You can paste screenshots directly from clipboard with <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-xs font-mono">Ctrl+V</kbd>
            </p>
          </div>
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

// ============================================
// Coverage Panel — company-wide GP evaluation coverage for the month
// ============================================

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface CoveragePanelProps {
  coverageData: Array<{
    teamId: number;
    teamName: string;
    gps: Array<{
      gpId: number;
      gpName: string;
      realName: string | null;
      evalCount: number;
      avgScore: number | null;
      lastEvalDate: Date | string | null;
      totalEvalsAllTime: number;
      status: 'complete' | 'partial' | 'missing';
    }>;
    summary: { total: number; complete: number; partial: number; missing: number };
  }> | undefined;
  coverageLoading: boolean;
  coverageMonth: { month: number; year: number };
}

function CoveragePanel({ coverageData, coverageLoading, coverageMonth }: CoveragePanelProps) {
  const teamData = coverageData?.[0];
  const summary = teamData?.summary;
  const monthLabel = `${MONTH_NAMES[coverageMonth.month - 1]} ${coverageMonth.year}`;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Coverage</h3>
            <p className="text-xs text-muted-foreground">{monthLabel} evaluation progress — all GPs</p>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {summary && !coverageLoading && (
        <div className="grid grid-cols-3 gap-px bg-border">
          <div className="bg-card px-4 py-2.5 text-center">
            <p className="text-lg font-bold tabular-nums text-emerald-600">{summary.complete}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Complete</p>
          </div>
          <div className="bg-card px-4 py-2.5 text-center">
            <p className="text-lg font-bold tabular-nums text-amber-600">{summary.partial}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">In Progress</p>
          </div>
          <div className="bg-card px-4 py-2.5 text-center">
            <p className="text-lg font-bold tabular-nums text-red-500">{summary.missing}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Missing</p>
          </div>
        </div>
      )}

      {/* GP Grid */}
      <div className="p-3">
        {coverageLoading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading coverage data...</span>
          </div>
        )}

        {!coverageLoading && !teamData && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No coverage data yet.
          </div>
        )}

        {!coverageLoading && teamData && teamData.gps.length > 0 && (
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {teamData.gps.map((gp) => (
                <Tooltip key={gp.gpId}>
                  <TooltipTrigger asChild>
                    <div className={`relative rounded-lg border p-2.5 transition-all hover:shadow-sm cursor-default ${
                      gp.status === 'complete'
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : gp.status === 'partial'
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-red-200/60 bg-red-50/30'
                    }`}>
                      {/* Status dot */}
                      <div className={`absolute top-2 right-2 h-2 w-2 rounded-full ${
                        gp.status === 'complete' ? 'bg-emerald-500' : gp.status === 'partial' ? 'bg-amber-500' : 'bg-red-400'
                      }`} />

                      <p className="text-xs font-semibold text-foreground truncate pr-4" title={gp.gpName}>
                        {gp.gpName}
                      </p>

                      {/* Eval count bar */}
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              gp.status === 'complete' ? 'bg-emerald-500' : gp.status === 'partial' ? 'bg-amber-500' : 'bg-red-400'
                            }`}
                            style={{ width: `${Math.min((gp.evalCount / 10) * 100, 100)}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums ${
                          gp.status === 'complete' ? 'text-emerald-600' : gp.status === 'partial' ? 'text-amber-600' : 'text-red-500'
                        }`}>
                          {gp.evalCount}/10
                        </span>
                      </div>

                      {/* Avg score if available */}
                      {gp.avgScore != null && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">avg <strong className="text-foreground">{gp.avgScore}</strong>/22</span>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="font-semibold text-sm">{gp.gpName}</p>
                    {gp.realName && <p className="text-xs text-muted-foreground">{gp.realName}</p>}
                    <div className="mt-1 space-y-0.5 text-xs">
                      <p>{gp.evalCount} eval{gp.evalCount !== 1 ? 's' : ''} this month{gp.evalCount < 10 ? ` — ${10 - gp.evalCount} more needed` : ' — target reached'}</p>
                      {gp.avgScore != null && <p>Avg score: {gp.avgScore}/22</p>}
                      <p>{gp.totalEvalsAllTime} total evals all time</p>
                      {gp.lastEvalDate && (
                        <p className="text-muted-foreground">Last: {new Date(gp.lastEvalDate).toLocaleDateString()}</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}

        {!coverageLoading && teamData && teamData.gps.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No GPs yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// UploadStat — calm KPI tile for the Upload page header strip. Same
// design language as the GP Stats / Reports tiles: 0.5px tone accent
// stripe, tone-coloured icon container, big tabular-nums value.
// Optional `spin` flag rotates the icon while uploads are in flight.
// ============================================
function UploadStat({
  icon: Icon, label, value, tone, spin,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "slate" | "emerald" | "sky" | "rose"; spin?: boolean }) {
  const accent = tone === "emerald" ? "from-emerald-300 to-emerald-400"
    : tone === "sky" ? "from-sky-300 to-sky-400"
      : tone === "rose" ? "from-rose-300 to-rose-400"
        : "from-slate-300 to-slate-400";
  const iconBg = tone === "emerald" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : tone === "sky" ? "bg-sky-100 text-sky-700 border-sky-200"
      : tone === "rose" ? "bg-rose-100 text-rose-700 border-rose-200"
        : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accent}`} aria-hidden />
      <div className="flex items-center gap-2.5">
        <span className={`h-8 w-8 shrink-0 rounded-lg border flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate">{label}</p>
          <p className="text-lg font-bold tabular-nums text-slate-900 leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Mode toggle + page shell — one Upload route, two workflows.
//   • Quick  — AI extracts and saves each screenshot on drop (+ Attitude).
//   • Bulk AI — extract a stack in parallel into an editable review grid,
//               then save them all in one shot.
// The active mode lives in the URL (?mode=bulk) so it deep-links and the
// Cmd+K palette can jump straight to it.
// ============================================

function UploadModeToggle({ mode, onChange }: { mode: UploadMode; onChange: (m: UploadMode) => void }) {
  const opt = (value: UploadMode, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={mode === value}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors ${
        mode === value
          ? "bg-background shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Upload mode">
      {opt("quick", "Quick", Zap)}
      {opt("bulk", "Bulk AI", ScanLine)}
    </div>
  );
}

function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export default function UploadPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const mode: UploadMode = new URLSearchParams(search).get("mode") === "bulk" ? "bulk" : "quick";
  const setMode = useCallback(
    (m: UploadMode) => setLocation(m === "bulk" ? "/upload?mode=bulk" : "/upload", { replace: true }),
    [setLocation],
  );
  const toggle = <UploadModeToggle mode={mode} onChange={setMode} />;

  if (mode === "bulk") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <BulkUploadPanel modeToggle={toggle} />
      </Suspense>
    );
  }
  return <QuickUploadPanel modeToggle={toggle} onSwitchToBulk={() => setMode("bulk")} />;
}
