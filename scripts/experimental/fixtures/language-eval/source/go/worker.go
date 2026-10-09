package main

type Worker struct {
	Enabled bool
}

func (w *Worker) Dispatch(kind string) string {
	if w.Enabled && kind == "report" {
		return "ready"
	}
	return "idle"
}
