package main

func main() {
	worker := Worker{Enabled: true}
	_ = worker.Dispatch("report")
}
