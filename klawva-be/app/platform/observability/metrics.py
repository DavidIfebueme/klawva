from collections import defaultdict
from dataclasses import dataclass


@dataclass
class MetricPoint:
    name: str
    value: int


class MetricsRegistry:
    def __init__(self) -> None:
        self._counters: dict[str, int] = defaultdict(int)

    def increment(self, name: str, amount: int = 1) -> None:
        self._counters[name] += amount

    def set(self, name: str, value: int) -> None:
        self._counters[name] = value

    def snapshot(self) -> list[MetricPoint]:
        return [MetricPoint(name=k, value=v) for k, v in sorted(self._counters.items())]


metrics_registry = MetricsRegistry()
