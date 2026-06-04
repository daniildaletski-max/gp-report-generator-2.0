import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, ShieldAlert, Plus, Trash2, CheckCircle2, Star } from "lucide-react";

type Group = "appearance" | "game";
interface DraftCriterion {
  key: string;
  label: string;
  description: string;
  maxScore: number;
  group: Group;
}

/**
 * Admin-only rubric manager — consumes the rubric authoring API
 * (rubric.listVersions / getActive / createVersion / activateVersion).
 * Standalone page (kept out of the 5.7k-line Admin.tsx) following the
 * same pattern as the Review queue.
 */
export default function Rubric() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const versionsQ = trpc.rubric.listVersions.useQuery();
  const activeQ = trpc.rubric.getActive.useQuery();

  const [label, setLabel] = useState("");
  const [draft, setDraft] = useState<DraftCriterion[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Seed the editor from the active rubric once, so admins start from the
  // current criteria instead of a blank slate.
  useEffect(() => {
    if (!seeded && activeQ.data) {
      setDraft(
        activeQ.data.criteria.map((c) => ({
          key: c.key,
          label: c.label,
          description: c.description ?? "",
          maxScore: c.maxScore,
          group: c.group as Group,
        })),
      );
      setSeeded(true);
    }
  }, [activeQ.data, seeded]);

  const createVersion = trpc.rubric.createVersion.useMutation({
    onSuccess: () => {
      utils.rubric.listVersions.invalidate();
      utils.rubric.getActive.invalidate();
      setLabel("");
      toast.success("Rubric version created");
    },
    onError: (err) => toast.error("Could not create: " + err.message),
  });

  const activateVersion = trpc.rubric.activateVersion.useMutation({
    onSuccess: () => {
      utils.rubric.listVersions.invalidate();
      utils.rubric.getActive.invalidate();
      toast.success("Active version switched");
    },
    onError: (err) => toast.error("Could not activate: " + err.message),
  });

  if (user && user.role !== "admin") {
    return (
      <div className="space-y-6">
        <PageHeader title="Rubric" icon={SlidersHorizontal} />
        <EmptyState icon={ShieldAlert} title="Admins only" description="Rubric management is restricted to administrators." />
      </div>
    );
  }

  const totalMax = draft.reduce((s, c) => s + (Number.isFinite(c.maxScore) ? c.maxScore : 0), 0);

  const updateRow = (i: number, patch: Partial<DraftCriterion>) =>
    setDraft((d) => d.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addRow = () =>
    setDraft((d) => [...d, { key: "", label: "", description: "", maxScore: 1, group: "appearance" }]);
  const removeRow = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));

  const submit = (activate: boolean) => {
    if (!label.trim()) return toast.error("Give the version a label");
    if (draft.length === 0) return toast.error("Add at least one criterion");
    createVersion.mutate({
      label: label.trim(),
      activate,
      criteria: draft.map((c, i) => ({
        key: c.key.trim(),
        label: c.label.trim(),
        description: c.description.trim() || undefined,
        maxScore: c.maxScore,
        group: c.group,
        sortOrder: i,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rubric"
        subtitle="Define how evaluations are scored. New versions are immutable snapshots — past scores keep their original rubric."
        icon={SlidersHorizontal}
      />

      {/* Existing versions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versions</CardTitle>
        </CardHeader>
        <CardContent>
          {versionsQ.isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : (versionsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            <div className="space-y-2">
              {(versionsQ.data ?? []).map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{v.label}</span>
                      {v.isActive === 1 && (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-200">
                          <Star className="h-3 w-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      v{v.version} · max {v.totalMax}
                    </span>
                  </div>
                  {v.isActive !== 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={activateVersion.isPending}
                      onClick={() => activateVersion.mutate({ id: v.id })}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Activate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New-version editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a new version</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Version label</label>
            <Input
              placeholder="e.g. v2 — adds Voice Clarity"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Criteria</span>
              <span className="text-xs text-muted-foreground">Total max: {totalMax}</span>
            </div>
            <div className="space-y-2">
              {draft.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-3"
                    placeholder="key (e.g. hair)"
                    value={c.key}
                    onChange={(e) => updateRow(i, { key: e.target.value })}
                  />
                  <Input
                    className="col-span-4"
                    placeholder="Label"
                    value={c.label}
                    onChange={(e) => updateRow(i, { label: e.target.value })}
                  />
                  <Select value={c.group} onValueChange={(v) => updateRow(i, { group: v as Group })}>
                    <SelectTrigger className="col-span-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appearance">Appearance</SelectItem>
                      <SelectItem value="game">Game</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="col-span-2"
                    type="number"
                    min={1}
                    value={String(c.maxScore)}
                    onChange={(e) => updateRow(i, { maxScore: parseInt(e.target.value, 10) || 0 })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    onClick={() => removeRow(i)}
                    aria-label="Remove criterion"
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1.5" /> Add criterion
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="outline" disabled={createVersion.isPending} onClick={() => submit(false)}>
              Save version
            </Button>
            <Button disabled={createVersion.isPending} onClick={() => submit(true)}>
              Save &amp; activate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
