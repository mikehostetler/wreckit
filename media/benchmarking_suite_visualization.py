"""
Manim Scene: Benchmarking Suite for Resumability and Concurrency Scaling

This scene visualizes the benchmarking suite that measures resumability
and concurrency scaling performance, generating paper-ready metrics in
multiple formats (JSON, Markdown, CSV).
"""

from manim import *


class BenchmarkingSuiteScene(Scene):
    """Visualizes the benchmarking suite with resumability and concurrency metrics"""

    def construct(self):
        # Title
        title = Text(
            "Benchmarking Suite",
            font_size=48,
            color=BLUE_B
        )
        subtitle = Text(
            "Resumability & Concurrency Scaling",
            font_size=32,
            color=GRAY
        )
        subtitle.next_to(title, DOWN, buff=0.3)

        self.play(Write(title), run_time=1)
        self.play(Write(subtitle), run_time=0.5)
        self.wait(0.5)
        self.play(FadeOut(title), FadeOut(subtitle))

        # Create main architecture diagram
        self.show_architecture()

        # Show resumability benchmarking
        self.show_resumability_benchmark()

        # Show concurrency scaling
        self.show_concurrency_scaling()

        # Show output formats
        self.show_output_formats()

        # Final summary
        self.show_summary()

    def show_architecture(self):
        """Display the benchmarking suite architecture"""
        # Main benchmark suite box
        suite_box = Rectangle(
            width=10,
            height=5,
            color=BLUE,
            fill_opacity=0.1,
            stroke_width=3
        )

        suite_title = Text("Benchmark Suite", font_size=28, color=BLUE)
        suite_title.to_edge(UP, buff=1.5)

        # Three main components
        resumability_box = Rectangle(
            width=2.5,
            height=2,
            color=GREEN,
            fill_opacity=0.2
        )
        resumability_box.shift(LEFT * 3.5)

        resumability_text = Text("Resumability", font_size=18, color=GREEN)
        resumability_text.move_to(resumability_box.get_center())

        concurrency_box = Rectangle(
            width=2.5,
            height=2,
            color=YELLOW,
            fill_opacity=0.2
        )

        concurrency_text = Text("Concurrency", font_size=18, color=YELLOW)
        concurrency_text.move_to(concurrency_box.get_center())

        scaling_box = Rectangle(
            width=2.5,
            height=2,
            color=RED,
            fill_opacity=0.2
        )
        scaling_box.shift(RIGHT * 3.5)

        scaling_text = Text("Scaling", font_size=18, color=RED)
        scaling_text.move_to(scaling_box.get_center())

        # Metrics collector
        metrics_collector = Rectangle(
            width=9,
            height=1,
            color=PURPLE,
            fill_opacity=0.2
        )
        metrics_collector.shift(DOWN * 1.5)

        metrics_text = Text("Metrics Collector & Generator", font_size=20, color=PURPLE)
        metrics_text.move_to(metrics_collector.get_center())

        # Animate architecture
        self.play(Create(suite_box), run_time=0.5)
        self.play(Write(suite_title), run_time=0.3)

        self.play(
            Create(resumability_box),
            Create(concurrency_box),
            Create(scaling_box),
            run_time=0.5
        )

        self.play(
            Write(resumability_text),
            Write(concurrency_text),
            Write(scaling_text),
            run_time=0.3
        )

        self.play(Create(metrics_collector), run_time=0.3)
        self.play(Write(metrics_text), run_time=0.3)

        # Draw arrows from components to metrics collector
        arrow1 = Arrow(
            resumability_box.get_bottom(),
            metrics_collector.get_top(),
            color=GREEN,
            buff=0.1
        )
        arrow2 = Arrow(
            concurrency_box.get_bottom(),
            metrics_collector.get_top(),
            color=YELLOW,
            buff=0.1
        )
        arrow3 = Arrow(
            scaling_box.get_bottom(),
            metrics_collector.get_top(),
            color=RED,
            buff=0.1
        )

        self.play(Create(arrow1), Create(arrow2), Create(arrow3), run_time=0.3)
        self.wait(1)

        # Fade out
        self.play(
            FadeOut(suite_box),
            FadeOut(suite_title),
            FadeOut(resumability_box),
            FadeOut(resumability_text),
            FadeOut(concurrency_box),
            FadeOut(concurrency_text),
            FadeOut(scaling_box),
            FadeOut(scaling_text),
            FadeOut(metrics_collector),
            FadeOut(metrics_text),
            FadeOut(arrow1),
            FadeOut(arrow2),
            FadeOut(arrow3),
            run_time=0.5
        )

    def show_resumability_benchmark(self):
        """Visualize resumability benchmarking process"""
        title = Text("Resumability Benchmark", font_size=36, color=GREEN)
        title.to_edge(UP, buff=1)
        self.play(Write(title), run_time=0.5)

        # Create simulation boxes with progress
        for i in range(5):
            box = Rectangle(
                width=1.5,
                height=0.8,
                color=GREEN,
                fill_opacity=0.3
            )
            box.shift(LEFT * 4 + RIGHT * i * 2)
            self.play(Create(box), run_time=0.1)

            # Progress bar inside box
            progress_width = 1.3 * (i + 1) / 5
            progress = Rectangle(
                width=progress_width,
                height=0.3,
                color=GREEN,
                fill_opacity=0.6
            )
            progress.move_to(box.get_center())
            self.play(Create(progress), run_time=0.2)

            # Add checkmark for final completion
            if i == 4:
                checkmark = Text("✓", font_size=40, color=GREEN)
                checkmark.next_to(box, UP, buff=0.5)
                self.play(Write(checkmark), run_time=0.2)

        # Metrics display
        metrics_text = Text(
            "Resume Time: 2.3s | State Size: 1.2MB | Overhead: 0.1%",
            font_size=24,
            color=GREEN
        )
        metrics_text.shift(DOWN * 2)
        self.play(Write(metrics_text), run_time=0.5)
        self.wait(1)
        self.play(FadeOut(title), FadeOut(metrics_text), run_time=0.5)

    def show_concurrency_scaling(self):
        """Visualize concurrency scaling benchmark"""
        title = Text("Concurrency Scaling", font_size=36, color=YELLOW)
        title.to_edge(UP, buff=1)
        self.play(Write(title), run_time=0.5)

        # Create bar chart
        bars = VGroup()
        heights = [1.0, 2.5, 4.5, 6.0, 7.2]
        labels = ["1T", "2T", "4T", "6T", "8T"]
        colors = [BLUE, GREEN, YELLOW, ORANGE, RED]

        for i, (height, label, color) in enumerate(zip(heights, labels, colors)):
            bar = Rectangle(
                width=0.8,
                height=height,
                color=color,
                fill_opacity=0.6
            )
            bar.shift(LEFT * 3.5 + RIGHT * i * 1.8 + DOWN * 1.5)

            text = Text(label, font_size=20)
            text.next_to(bar, DOWN, buff=0.2)

            bars.add(bar)
            bars.add(text)

        self.play(Create(bars), run_time=1)

        # Add efficiency metric
        efficiency_text = Text(
            "Efficiency: 90% at 10 threads",
            font_size=24,
            color=YELLOW
        )
        efficiency_text.to_edge(DOWN, buff=1)
        self.play(Write(efficiency_text), run_time=0.5)
        self.wait(1)
        self.play(FadeOut(bars), FadeOut(title), FadeOut(efficiency_text), run_time=0.5)

    def show_output_formats(self):
        """Show the three output formats"""
        title = Text("Output Formats", font_size=36, color=PURPLE)
        title.to_edge(UP, buff=1)
        self.play(Write(title), run_time=0.5)

        # Create three format boxes
        formats = VGroup()
        format_names = ["JSON", "Markdown", "CSV"]
        colors = [BLUE, GREEN, ORANGE]

        for i, (name, color) in enumerate(zip(format_names, colors)):
            box = Rectangle(
                width=2.5,
                height=1.5,
                color=color,
                fill_opacity=0.2,
                stroke_width=2
            )
            box.shift(LEFT * 4 + RIGHT * i * 4)

            text = Text(name, font_size=28, color=color)
            text.move_to(box.get_center())

            formats.add(box)
            formats.add(text)

        self.play(Create(formats), run_time=0.5)

        # Show sample output text
        sample_lines = VGroup(
            Text("{", font_size=24, color=GRAY),
            Text('  "resumability": {', font_size=20, color=BLUE),
            Text('    "time": 2.3,', font_size=18, color=GREEN),
            Text('    "overhead": "0.1%"', font_size=18, color=GREEN),
            Text("  },", font_size=20, color=BLUE),
            Text('  "concurrency": {', font_size=20, color=BLUE),
            Text('    "efficiency": "90%"', font_size=18, color=GREEN),
            Text("  }", font_size=20, color=BLUE),
            Text("}", font_size=24, color=GRAY)
        )
        sample_lines.arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        sample_lines.shift(DOWN * 1.5 + RIGHT * 0.5)
        sample_lines.scale(0.6)

        self.play(Write(sample_lines), run_time=1)
        self.wait(1)
        self.play(FadeOut(formats), FadeOut(title), FadeOut(sample_lines), run_time=0.5)

    def show_summary(self):
        """Show final summary"""
        summary_items = [
            "Paper-Ready Metrics",
            "✓ Multiple Output Formats",
            "✓ Resumability Measurements",
            "✓ Concurrency Scaling Analysis",
            "✓ Reproducible Benchmarks"
        ]

        summary_group = VGroup()
        for item in summary_items:
            text = Text(item, font_size=28, color=GREEN if item.startswith("✓") else BLUE)
            summary_group.add(text)

        summary_group.arrange(DOWN, aligned_edge=LEFT, buff=0.5)
        summary_group.shift(LEFT * 1.5)

        for item in summary_group:
            self.play(Write(item), run_time=0.3)

        self.wait(2)
        self.play(FadeOut(summary_group), run_time=0.5)
