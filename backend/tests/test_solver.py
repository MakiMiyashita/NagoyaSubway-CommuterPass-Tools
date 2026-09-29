import unittest

from backend.app import solver


class SubwaySolverTest(unittest.TestCase):
    def solve(self, *, endpoints, avoid=None):
        return solver.solve(
            endpoints=endpoints,
            via_hard=[],
            via_soft=[],
            avoid=avoid or [],
            budget=5,
            min_budget=1,
            max_results=10,
            timeout_seconds=1,
        )

    def test_adjacent_endpoints_return_a_route(self):
        response = self.solve(endpoints=["Takabata", "Hatta"])

        self.assertEqual(response["search"]["returned_count"], 1)
        self.assertEqual(response["results"][0]["route_names"], ["Takabata", "Hatta"])
        self.assertEqual(response["results"][0]["zone"], 1)

    def test_avoided_station_is_not_used(self):
        response = self.solve(
            endpoints=["Takabata", "Iwatsuka"],
            avoid=["Hatta"],
        )

        self.assertEqual(response["results"], [])

    def test_kamiiida_line_is_loaded(self):
        response = self.solve(endpoints=["Kamiiida", "Heian-dori"])

        self.assertEqual(response["results"][0]["route_names"], ["Kamiiida", "Heian-dori"])


if __name__ == "__main__":
    unittest.main()
