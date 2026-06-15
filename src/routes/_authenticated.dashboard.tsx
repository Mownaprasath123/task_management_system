import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Clock, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { DashboardAPI, TasksAPI, type Task } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — TaskFlow" }] }),
  component: DashboardPage,
});

const priorityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: DashboardAPI.stats,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: TasksAPI.list,
  });

  const recent = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const cards = [
    { label: "Total tasks", value: stats?.total ?? 0, icon: ListChecks, color: "text-primary bg-primary/10" },
    { label: "In progress", value: stats?.inProgress ?? 0, icon: Clock, color: "text-warning bg-warning/10" },
    { label: "Completed", value: stats?.done ?? 0, icon: CheckCircle2, color: "text-success bg-success/10" },
    { label: "Overdue", value: stats?.overdue ?? 0, icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your task overview at a glance.</p>
        </div>
        <Button asChild>
          <Link to="/tasks">
            Manage tasks <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Completion rate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={stats?.completionRate ?? 0} />
          <p className="text-sm text-muted-foreground">
            {stats?.completionRate ?? 0}% of your tasks are completed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tasks yet.{" "}
              <Link to="/tasks" className="text-primary hover:underline">
                Create your first task
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((t: Task) => (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(t.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={priorityVariant[t.priority]}>{t.priority}</Badge>
                    <Badge variant="outline">{t.status.replace("_", " ")}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
